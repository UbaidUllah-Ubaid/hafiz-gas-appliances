import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

import { CartServices, CartItem } from '../cart/cartServices/cart-services';
import { Router } from '@angular/router';

import {
  Component,
  OnDestroy,
  OnInit,
  inject,
  ChangeDetectorRef
} from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

interface ProductOption {
  option_group: string;
  option_value: string;
  extra_price: number;
}

interface Product {
  id: number | string;
  title?: string;
  name?: string;
  description?: string;
  price?: number | string;
  image_url?: string;
  imageUrl?: string;
  images?: string[] | string;
  options?: ProductOption[] | unknown;
  category?: string;
  is_published?: boolean | number;
  stock?: number | string;
}

@Component({
  selector: 'app-product-details',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './product-details.html',
  styleUrl: './product-details.css',
})
export class ProductDetails implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);

  private cartServices = inject(CartServices);
private router = inject(Router);

  private readonly apiUrl = 'http://localhost:3000/api/products';
  private readonly serverUrl = 'http://localhost:3000';

  private routeSubscription?: Subscription;
  private productSubscription?: Subscription;
  private relatedSubscription?: Subscription;

  product: Product | null = null;
  relatedProducts: Product[] = [];

  loading = true;
  relatedLoading = true;
  errorMessage = '';

  images: string[] = [];
  selectedImage = '';

  selectedColor = '';
  selectedSize = '';
  selectedGasType = '';
  quantity: number = 1;

  ngOnInit(): void {
    this.routeSubscription = this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (!id) {
        this.loading = false;
        this.errorMessage = 'Product ID nahi mila.';
        return;
      }
      this.loadProduct(id);
      this.loadRelatedProducts(id);
    });
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
    this.productSubscription?.unsubscribe();
    this.relatedSubscription?.unsubscribe();
  }

  get productName(): string {
    return this.product?.title || this.product?.name || 'Product';
  }

  get stockQuantity(): number {
  return Number(this.product?.stock ?? 0);
}

get isOutOfStock(): boolean {
  return this.stockQuantity <= 0;
}

  private normalizeOptionGroup(group: unknown): string {
    return String(group ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  }

  get options(): ProductOption[] {
    const rawOptions = this.product?.options;
    if (!Array.isArray(rawOptions)) return [];

    return rawOptions.map((option: any): ProductOption => ({
      option_group: String(option?.option_group ?? option?.group ?? '').trim(),
      option_value: String(option?.option_value ?? option?.value ?? '').trim(),
      extra_price: Number(option?.extra_price ?? option?.price ?? 0)
    })).filter(option => option.option_group && option.option_value);
  }

  get colors(): ProductOption[] {
    return this.options.filter(option =>
      ['color', 'colour', 'colors', 'colours'].includes(this.normalizeOptionGroup(option.option_group))
    );
  }

  get sizes(): ProductOption[] {
    return this.options.filter(option =>
      ['size', 'sizes', 'capacity'].includes(this.normalizeOptionGroup(option.option_group))
    );
  }

  get gasTypes(): ProductOption[] {
    return this.options.filter(option =>
      ['gas type', 'gas types', 'gastype', 'gas'].includes(this.normalizeOptionGroup(option.option_group))
    );
  }

  get selectedColorOption(): ProductOption | undefined {
    return this.colors.find(color => color.option_value === this.selectedColor);
  }

  get selectedSizeOption(): ProductOption | undefined {
    return this.sizes.find(size => size.option_value === this.selectedSize);
  }

  get basePrice(): number {
    return Number(this.product?.price ?? 0);
  }

  get colorCharge(): number {
    return Number(this.selectedColorOption?.extra_price ?? 0);
  }

  get sizeCharge(): number {
    return Number(this.selectedSizeOption?.extra_price ?? 0);
  }

  get unitPrice(): number {
    return this.basePrice + this.colorCharge + this.sizeCharge;
  }

  get finalPrice(): number {
    return this.unitPrice * this.quantity;
  }

  loadProduct(id: string): void {
    this.loading = true;
    this.productSubscription = this.http.get<any>(`${this.apiUrl}/${encodeURIComponent(id)}`).subscribe({
      next: response => {
        let loadedProduct = response?.data || response?.product || response;
        this.product = loadedProduct as Product;
        this.prepareImages(this.product);
        this.setDefaultSelections();
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.errorMessage = 'Product load nahi hua.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadRelatedProducts(currentId: string): void {
    this.relatedSubscription = this.http.get<any>(this.apiUrl).subscribe({
      next: response => {
        const products = Array.isArray(response) ? response : response?.data || response?.products || [];
        this.relatedProducts = products.filter((p: Product) => String(p.id) !== String(currentId));
        this.relatedLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.relatedProducts = [];
        this.relatedLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  private prepareImages(product: Product): void {
    let paths: string[] = [];
    if (Array.isArray(product.images)) {
      paths = product.images;
    } else if (typeof product.images === 'string') {
      try { paths = JSON.parse(product.images); } catch { paths = [product.images]; }
    }
    const mainImage = product.image_url || product.imageUrl || '';
    if (mainImage && !paths.includes(mainImage)) paths.unshift(mainImage);
    this.images = paths.filter(Boolean).map(p => this.imageUrl(p));
    this.selectedImage = this.images[0] || '';
  }

  imageUrl(path?: string): string {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${this.serverUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  relatedImage(product: Product): string {
    return this.imageUrl(product.image_url || product.imageUrl || '');
  }

  relatedPrice(product: Product): number {
    return Number(product.price ?? 0);
  }

  private setDefaultSelections(): void {
    this.selectedColor = this.colors[0]?.option_value ?? '';
    this.selectedSize = this.sizes[0]?.option_value ?? '';
    this.selectedGasType = this.gasTypes[0]?.option_value ?? '';
    this.quantity = 1;
  }

  selectColor(colorVal: string): void {
    this.selectedColor = colorVal;
  }

  selectSize(sizeVal: string): void {
    this.selectedSize = sizeVal;
  }

  selectGasType(gasVal: string): void {
    this.selectedGasType = gasVal;
  }

  increaseQty(): void {
    this.quantity++;
  }

  decreaseQty(): void {
    if (this.quantity > 1) {
      this.quantity--;
    }
  }

  selectImage(image: string): void {
    this.selectedImage = image;
  }

  addToCart(): void {
  if (!this.product) {
    alert('Product available nahi hai.');
    return;
  }

  if (this.isOutOfStock) {
  alert('Sorry, this product is currently out of stock.');
  return;
}

  const item: CartItem = {
    id: `${this.product.id}-${this.selectedColor}-${this.selectedSize}-${this.selectedGasType}`,
    productId: this.product.id,
    name: this.productName,
    image: this.images[0] || this.imageUrl(
      this.product.image_url || this.product.imageUrl || ''
    ),
    price: this.unitPrice,
    quantity: this.quantity,
    color: this.selectedColor,
    size: this.selectedSize,
    gasType: this.selectedGasType
  };

  this.cartServices.addToCart(item);
  // alert('Product cart mein add ho gaya!');
  this.showSuccessToast();
}

buyNow(): void {
  if (!this.product) {
    alert('Product available nahi hai.');
    return;
  }

  this.addToCart();
  this.router.navigate(['/checkout']);
}

  formatPrice(value: number): string {
    return value.toLocaleString('en-PK');
  }


  showCartToast = false;
cartToastMessage = 'Product added to cart successfully!';
private toastTimer?: ReturnType<typeof setTimeout>;

private showSuccessToast(): void {
  this.cartToastMessage = 'Product added to cart successfully!';
  this.showCartToast = true;

  if (this.toastTimer) {
    clearTimeout(this.toastTimer);
  }

  this.toastTimer = setTimeout(() => {
    this.showCartToast = false;
  }, 3000);
}


  
}