import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';

interface ProductOption {
  id?: number;
  option_group: string;
  option_value: string;
  extra_price: number;
}

interface Product {
  id: number;
  title: string;
  sku: string;
  description: string;
  price: number;
  stock: number;
  image_url: string;
  images: string[];
  category: string;
  is_published: boolean;
  options: ProductOption[];
}

@Component({
  selector: 'app-product-update',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './product-update.html',
  styleUrl: './product-update.css'
})
export class ProductsUpdate implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  private readonly apiUrl = 'https://hafiz-gas-appliances-backend.onrender.com/api/products';
  private readonly backendUrl = 'https://hafiz-gas-appliances-backend.onrender.com';

  products: Product[] = [];

  loading = false;
  saving = false;
  uploading = false;

  editing = false;
  selectedProductId: number | null = null;

  error = '';
  success = '';

  selectedImages: File[] = [];
  imagePreviews: string[] = [];

  editForm: Product = this.emptyProduct();

  get headers(): HttpHeaders {
    const token =
      localStorage.getItem('admin_token') ||
      localStorage.getItem('hafiz_gas_token') ||
      '';

    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }

  ngOnInit(): void {
    this.loadProducts();
  }

  ngOnDestroy(): void {
    this.clearPreviews();
  }

  private emptyProduct(): Product {
    return {
      id: 0,
      title: '',
      sku: '',
      description: '',
      price: 0,
      stock: 0,
      image_url: '',
      images: [],
      category: '',
      is_published: true,
      options: []
    };
  }

  imageUrl(url: string | null | undefined): string {
    if (!url) return 'assets/no-image.png';

    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    return `${this.backendUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  loadProducts(): void {
    this.loading = true;
    this.error = '';

    this.http.get<any>(`${this.apiUrl}/admin/all`, {
      headers: this.headers
    }).subscribe({
      next: (response) => {
        const data = response?.data ?? response?.products ?? response ?? [];

        this.products = Array.isArray(data) ? data : [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error =
          err.error?.message ||
          'Products load nahi ho sake. Admin login aur backend check karo.';
        this.cdr.detectChanges();
      }
    });
  }

  startEdit(product: Product): void {
    this.clearPreviews();

    this.selectedProductId = product.id;

    this.editForm = {
      ...product,
      images: [...(product.images || [])],
      options: (product.options || []).map(option => ({
        ...option
      }))
    };

    if (!this.editForm.images.length && product.image_url) {
      this.editForm.images = [product.image_url];
    }

    this.selectedImages = [];
    this.imagePreviews = [];

    this.error = '';
    this.success = '';
    this.editing = true;

    document.body.style.overflow = 'hidden';
  }

  cancelEdit(): void {
    this.editing = false;
    this.selectedProductId = null;
    this.editForm = this.emptyProduct();

    this.selectedImages = [];
    this.clearPreviews();

    this.error = '';
    document.body.style.overflow = '';
  }

  addOption(): void {
    this.editForm.options.push({
      option_group: 'Color',
      option_value: '',
      extra_price: 0
    });
  }

  removeOption(index: number): void {
    this.editForm.options.splice(index, 1);
  }

  onImagesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);

    this.error = '';

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif'
    ];

    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        this.error = 'Sirf JPG, PNG, WEBP aur GIF images allowed hain.';
        input.value = '';
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        this.error = 'Har image ka size 5MB se kam hona chahiye.';
        input.value = '';
        return;
      }
    }

    const totalImages =
      this.editForm.images.length +
      this.selectedImages.length +
      files.length;

    if (totalImages > 10) {
      this.error = 'Maximum 10 product images allowed hain.';
      input.value = '';
      return;
    }

    this.selectedImages.push(...files);

    for (const file of files) {
      this.imagePreviews.push(URL.createObjectURL(file));
    }

    input.value = '';
  }

  removeExistingImage(index: number): void {
    this.editForm.images.splice(index, 1);
  }

  removeNewImage(index: number): void {
    const preview = this.imagePreviews[index];

    if (preview) {
      URL.revokeObjectURL(preview);
    }

    this.imagePreviews.splice(index, 1);
    this.selectedImages.splice(index, 1);
  }

  private clearPreviews(): void {
    this.imagePreviews.forEach(url => URL.revokeObjectURL(url));
    this.imagePreviews = [];
  }

  saveProduct(): void {
    if (!this.selectedProductId || this.saving) return;

    this.error = '';
    this.success = '';

    const form = this.editForm;

    if (
      !form.title.trim() ||
      !form.sku.trim() ||
      !form.description.trim() ||
      !form.category.trim()
    ) {
      this.error = 'Title, SKU, description aur category required hain.';
      return;
    }

    if (!Number.isFinite(Number(form.price)) || Number(form.price) <= 0) {
      this.error = 'Price zero se zyada honi chahiye.';
      return;
    }

    if (
      !Number.isInteger(Number(form.stock)) ||
      Number(form.stock) < 0
    ) {
      this.error = 'Stock zero ya positive whole number hona chahiye.';
      return;
    }

    for (const option of form.options) {
      if (
        !option.option_group.trim() ||
        !option.option_value.trim() ||
        !Number.isFinite(Number(option.extra_price)) ||
        Number(option.extra_price) < 0
      ) {
        this.error = 'Product options ki details check karo.';
        return;
      }
    }

    this.saving = true;

    if (this.selectedImages.length > 0) {
      this.uploading = true;

      const formData = new FormData();

      this.selectedImages.forEach(file => {
        formData.append('images', file);
      });

      this.http.post<any>(
        `${this.apiUrl}/upload-multiple`,
        formData,
        { headers: this.headers }
      ).subscribe({
        next: (response) => {
          this.uploading = false;

          const uploadedImages =
            response?.images ||
            response?.data?.images ||
            [];

          if (!Array.isArray(uploadedImages)) {
            this.saving = false;
            this.error = 'Image upload ka response sahi nahi mila.';
            this.cdr.detectChanges();
            return;
          }

          const allImages = [
            ...this.editForm.images,
            ...uploadedImages
          ];

          this.updateProduct(allImages);
        },
        error: (err) => {
          this.uploading = false;
          this.saving = false;
          this.error =
            err.error?.message || 'Images upload nahi ho sakin.';
          this.cdr.detectChanges();
        }
      });
    } else {
      this.updateProduct([...this.editForm.images]);
    }
  }

  private updateProduct(images: string[]): void {
    if (!this.selectedProductId) return;

    const payload = {
      title: this.editForm.title.trim(),
      sku: this.editForm.sku.trim(),
      description: this.editForm.description.trim(),
      price: Number(this.editForm.price),
      stock: Number(this.editForm.stock),
      category: this.editForm.category.trim(),
      is_published: this.editForm.is_published,
      images,
      image_url: images[0] || '',
      options: this.editForm.options.map(option => ({
        option_group: option.option_group.trim(),
        option_value: option.option_value.trim(),
        extra_price: Number(option.extra_price)
      }))
    };

    this.http.put<any>(
      `${this.apiUrl}/${this.selectedProductId}`,
      payload,
      { headers: this.headers }
    ).subscribe({
      next: () => {
        this.saving = false;
        this.success = 'Product successfully update ho gaya.';

        this.cancelEdit();
        this.loadProducts();

        this.cdr.detectChanges();
      },
      error: (err) => {
        this.saving = false;
        this.error =
          err.error?.message ||
          'Product update nahi hua. Backend response check karo.';
        this.cdr.detectChanges();
      }
    });
  }

  deleteProduct(product: Product): void {
    const confirmed = confirm(
      `Kya aap "${product.title}" ko delete karna chahte hain?`
    );

    if (!confirmed) return;

    this.error = '';
    this.success = '';

    this.http.delete<any>(
      `${this.apiUrl}/${product.id}`,
      { headers: this.headers }
    ).subscribe({
      next: () => {
        this.products = this.products.filter(
          item => item.id !== product.id
        );

        if (this.selectedProductId === product.id) {
          this.cancelEdit();
        }

        this.success = 'Product delete ho gaya.';
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.error =
          err.error?.message ||
          'Product delete nahi ho saka.';
        this.cdr.detectChanges();
      }
    });
  }
}