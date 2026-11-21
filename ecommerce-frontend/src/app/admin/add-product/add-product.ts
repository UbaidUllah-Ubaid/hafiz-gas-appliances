import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';

interface ProductOption {
  option_group: string;
  option_value: string;
  extra_price: number;
  enabled?: boolean;
}

interface UploadResponse {
  images: string[];
  main_image?: string;
}

@Component({
  selector: 'app-add-product',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-product.html',
  styleUrl: './add-product.css',
})
export class AddProduct {
  private http = inject(HttpClient);
  private router = inject(Router);

  private readonly apiUrl = 'http://https://hafiz-gas-appliances.onrender.com/api/products';

  saving = false;
  uploading = false;
  error = '';
  success = '';

  selectedImages: File[] = [];
  imagePreviews: string[] = [];

  product = {
    title: '',
    sku: '',
    description: '',
    price: 0,
    stock: 0,
    category: '',
    image_url: '',
    is_published: true,
  };

  colors: ProductOption[] = [
    {
      option_group: 'Color',
      option_value: 'Silver',
      extra_price: 0,
      enabled: true,
    },
    {
      option_group: 'Color',
      option_value: 'Golden',
      extra_price: 0,
      enabled: true,
    },
  ];

  gasTypes: ProductOption[] = [
    {
      option_group: 'Gas Type',
      option_value: 'Sui Gas',
      extra_price: 0,
      enabled: true,
    },
    {
      option_group: 'Gas Type',
      option_value: 'LPG',
      extra_price: 0,
      enabled: true,
    },
  ];

  sizes: ProductOption[] = [
    {
      option_group: 'Size',
      option_value: '',
      extra_price: 0,
    },
  ];

  addSize(): void {
    this.sizes.push({
      option_group: 'Size',
      option_value: '',
      extra_price: 0,
    });
  }

  removeSize(index: number): void {
    this.sizes.splice(index, 1);

    if (this.sizes.length === 0) {
      this.addSize();
    }
  }

  onImagesSelected(event: Event): void {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);

  this.error = '';
  this.success = '';

  if (!files.length) return;

  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ];

  for (const file of files) {
    if (!allowedTypes.includes(file.type)) {
      this.error = 'Sirf JPG, PNG, WEBP ya GIF images allowed hain.';
      input.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.error = `"${file.name}" 5 MB se bari hai.`;
      input.value = '';
      return;
    }
  }

  if (this.selectedImages.length + files.length > 10) {
    this.error = 'Maximum 10 images select kar sakte ho.';
    input.value = '';
    return;
  }

  // Add new images without removing previously selected images.
  this.selectedImages = [...this.selectedImages, ...files];

  const newPreviews = files.map(file => URL.createObjectURL(file));
  this.imagePreviews = [...this.imagePreviews, ...newPreviews];

  // First selected image remains the main image.
  this.product.image_url = '';

  // Allow selecting the same file again if needed.
  input.value = '';
}

  private clearImagePreviews(): void {
    for (const preview of this.imagePreviews) {
      URL.revokeObjectURL(preview);
    }

    this.imagePreviews = [];
  }

  saveProduct(): void {
    this.error = '';
    this.success = '';

    const price = Number(this.product.price);
    const stock = Number(this.product.stock);

    if (
      !this.product.title.trim() ||
      !this.product.sku.trim() ||
      !this.product.category.trim() ||
      !this.product.description.trim() ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      this.error = 'Please fill all required fields correctly.';
      return;
    }

    if (!this.colors.some(color => color.enabled)) {
      this.error = 'Kam az kam ek color select karo.';
      return;
    }

    if (!this.gasTypes.some(gas => gas.enabled)) {
      this.error = 'Kam az kam ek gas type select karo.';
      return;
    }

    const golden = this.colors.find(
      color => color.option_value === 'Golden'
    );

    if (
      golden &&
      (!Number.isFinite(Number(golden.extra_price)) ||
        Number(golden.extra_price) < 0)
    ) {
      this.error = 'Golden ki extra price sahi enter karo.';
      return;
    }

    const invalidSize = this.sizes.some(size => {
      const value = size.option_value.trim();
      const extra = Number(size.extra_price);

      return (
        !Number.isFinite(extra) ||
        extra < 0 ||
        (value === '' && extra !== 0)
      );
    });

    if (invalidSize) {
      this.error = 'Har size ki extra price sahi enter karo.';
      return;
    }

    const token = localStorage.getItem('admin_token');

    if (!token) {
      this.error = 'Session expire ho gaya. Dobara login karo.';
      this.router.navigate(['/admin/login']);
      return;
    }

    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });

    this.saving = true;

    if (this.selectedImages.length > 0) {
      this.uploading = true;

      const formData = new FormData();

      for (const image of this.selectedImages) {
        formData.append('images', image);
      }

      this.http.post<UploadResponse>(
        `${this.apiUrl}/upload-multiple`,
        formData,
        { headers }
      ).subscribe({
        next: response => {
          this.uploading = false;

          const uploadedImages = Array.isArray(response?.images)
            ? response.images
            : [];

          if (uploadedImages.length === 0) {
            this.saving = false;
            this.error = 'Backend se uploaded images nahi milin.';
            return;
          }

          this.submitProduct(headers, uploadedImages);
        },
        error: err => {
          console.error('Multiple image upload error:', err);

          this.uploading = false;
          this.saving = false;
          this.error =
            err.error?.error ||
            err.error?.message ||
            'Images upload nahi huin. Backend routes check karo.';
        },
      });

      return;
    }

    this.submitProduct(headers, []);
  }

  private submitProduct(
    headers: HttpHeaders,
    uploadedImages: string[]
  ): void {
    const sizeOptions = this.sizes
      .filter(size => size.option_value.trim() !== '')
      .map(size => ({
        option_group: 'Size',
        option_value: size.option_value.trim(),
        extra_price: Number(size.extra_price) || 0,
      }));

    const colorOptions = this.colors
      .filter(color => color.enabled)
      .map(color => ({
        option_group: 'Color',
        option_value: color.option_value,
        extra_price: color.option_value === 'Silver'
          ? 0
          : Number(color.extra_price) || 0,
      }));

    const gasOptions = this.gasTypes
      .filter(gas => gas.enabled)
      .map(gas => ({
        option_group: 'Gas Type',
        option_value: gas.option_value,
        extra_price: 0,
      }));

    const payload = {
      ...this.product,
      price: Number(this.product.price),
      stock: Number(this.product.stock),
      image_url: uploadedImages[0] || '',
      images: uploadedImages,
      options: [
        ...colorOptions,
        ...sizeOptions,
        ...gasOptions,
      ],
    };

    this.http.post(
      this.apiUrl,
      payload,
      { headers }
    ).subscribe({
      next: () => {
        this.saving = false;
        this.success = 'Product successfully save ho gaya!';

        setTimeout(() => {
          this.router.navigate(['/admin/products']);
        }, 1000);
      },
      error: err => {
        console.error('Save product error:', err);

        this.saving = false;
        this.error =
          err.error?.error ||
          err.error?.message ||
          'Product save nahi hua. Backend API check karo.';
      },
    });
  }

  cancel(): void {
    this.clearImagePreviews();
    this.router.navigate(['/admin/products']);
  }
}