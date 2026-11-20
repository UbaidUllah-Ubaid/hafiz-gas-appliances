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

interface CustomerUser {
  id: number | string;
  name?: string;
  email?: string;
  role?: string;
}

interface ProductReview {
  id: number | string;
  product_id: number | string;
  user_id: number | string;
  rating: number;
  comment: string;
  customer_name?: string;
  created_at?: string;
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

  private readonly apiUrl =
    'https://hafiz-gas-appliances-backend.onrender.com/api/products';

  private readonly serverUrl =
    'https://hafiz-gas-appliances-backend.onrender.com';

  private routeSubscription?: Subscription;
  private productSubscription?: Subscription;
  private relatedSubscription?: Subscription;
  private reviewsSubscription?: Subscription;
  private submitReviewSubscription?: Subscription;
  private deleteReviewSubscription?: Subscription;

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
  quantity = 1;

  // Product Reviews
  reviews: ProductReview[] = [];
  reviewLoading = false;
  reviewError = '';

  averageRating = 0;
  reviewCount = 0;

  reviewRating = 5;
  reviewComment = '';

  submittingReview = false;
  deletingReviewId: number | string | null = null;

  reviewSuccess = '';
  reviewSubmitError = '';

  currentUser: CustomerUser | null = null;

  ngOnInit(): void {
    this.loadCurrentUser();

    this.routeSubscription = this.route.paramMap.subscribe(params => {
      const id = params.get('id');

      if (!id) {
        this.loading = false;
        this.errorMessage = 'Product ID nahi mila.';
        return;
      }

      this.product = null;
      this.errorMessage = '';
      this.reviews = [];
      this.averageRating = 0;
      this.reviewCount = 0;
      this.reviewRating = 5;
      this.reviewComment = '';
      this.reviewSuccess = '';
      this.reviewSubmitError = '';

      this.loadProduct(id);
      this.loadRelatedProducts(id);
      this.loadReviews(id);
    });
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
    this.productSubscription?.unsubscribe();
    this.relatedSubscription?.unsubscribe();
    this.reviewsSubscription?.unsubscribe();
    this.submitReviewSubscription?.unsubscribe();
    this.deleteReviewSubscription?.unsubscribe();

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
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
    return String(group ?? '')
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ');
  }

  get options(): ProductOption[] {
    const rawOptions = this.product?.options;

    if (!Array.isArray(rawOptions)) return [];

    return rawOptions
      .map((option: any): ProductOption => ({
        option_group: String(
          option?.option_group ?? option?.group ?? ''
        ).trim(),

        option_value: String(
          option?.option_value ?? option?.value ?? ''
        ).trim(),

        extra_price: Number(
          option?.extra_price ?? option?.price ?? 0
        )
      }))
      .filter(option => option.option_group && option.option_value);
  }

  get colors(): ProductOption[] {
    return this.options.filter(option =>
      ['color', 'colour', 'colors', 'colours'].includes(
        this.normalizeOptionGroup(option.option_group)
      )
    );
  }

  get sizes(): ProductOption[] {
    return this.options.filter(option =>
      ['size', 'sizes', 'capacity'].includes(
        this.normalizeOptionGroup(option.option_group)
      )
    );
  }

  get gasTypes(): ProductOption[] {
    return this.options.filter(option =>
      ['gas type', 'gas types', 'gastype', 'gas'].includes(
        this.normalizeOptionGroup(option.option_group)
      )
    );
  }

  get selectedColorOption(): ProductOption | undefined {
    return this.colors.find(
      color => color.option_value === this.selectedColor
    );
  }

  get selectedSizeOption(): ProductOption | undefined {
    return this.sizes.find(
      size => size.option_value === this.selectedSize
    );
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

  // Authentication
  private loadCurrentUser(): void {
    try {
      const storedUser = localStorage.getItem('hafiz_gas_user');
      this.currentUser = storedUser ? JSON.parse(storedUser) : null;
    } catch {
      this.currentUser = null;
    }
  }

  get isLoggedIn(): boolean {
    return !!(
      localStorage.getItem('hafiz_gas_token') &&
      this.currentUser?.id
    );
  }

  get myReview(): ProductReview | undefined {
    if (!this.currentUser?.id) return undefined;

    return this.reviews.find(
      review => String(review.user_id) === String(this.currentUser?.id)
    );
  }

  canDeleteReview(review: ProductReview): boolean {
    if (!this.currentUser?.id) return false;

    const isAdmin = this.currentUser.role === 'admin';

    const isOwner =
      String(review.user_id) === String(this.currentUser.id);

    return isAdmin || isOwner;
  }

  // Load Product
  loadProduct(id: string): void {
    this.loading = true;
    this.errorMessage = '';

    this.productSubscription?.unsubscribe();

    this.productSubscription = this.http
      .get<any>(`${this.apiUrl}/${encodeURIComponent(id)}`)
      .subscribe({
        next: response => {
          const loadedProduct =
            response?.data || response?.product || response;

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

  // Load Related Products
  loadRelatedProducts(currentId: string): void {
    this.relatedLoading = true;
    this.relatedSubscription?.unsubscribe();

    this.relatedSubscription = this.http
      .get<any>(this.apiUrl)
      .subscribe({
        next: response => {
          const products = Array.isArray(response)
            ? response
            : response?.data || response?.products || [];

          this.relatedProducts = products.filter(
            (p: Product) => String(p.id) !== String(currentId)
          );

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

  // =========================
  // Product Reviews
  // =========================

  loadReviews(productId: string): void {
    this.reviewLoading = true;
    this.reviewError = '';

    this.reviewsSubscription?.unsubscribe();

    this.reviewsSubscription = this.http
      .get<any>(
        `${this.apiUrl}/${encodeURIComponent(productId)}/reviews`
      )
      .subscribe({
        next: response => {
          const result = response?.data || response;

          this.reviews = Array.isArray(result?.reviews)
            ? result.reviews
            : [];

          this.averageRating = Number(
            result?.average_rating ?? 0
          );

          this.reviewCount = Number(
            result?.review_count ?? this.reviews.length
          );

          // If customer already reviewed this product,
          // load their existing review into the form.
          const existingReview = this.myReview;

          if (existingReview) {
            this.reviewRating = Number(existingReview.rating);
            this.reviewComment = existingReview.comment || '';
          }

          this.reviewLoading = false;
          this.cdr.detectChanges();
        },

        error: error => {
          this.reviews = [];
          this.averageRating = 0;
          this.reviewCount = 0;
          this.reviewLoading = false;

          this.reviewError =
            error?.status === 404
              ? 'Reviews API abhi backend mein available nahi hai.'
              : 'Reviews load nahi ho sake. Please try again.';

          this.cdr.detectChanges();
        }
      });
  }

  setReviewRating(rating: number): void {
    if (rating < 1 || rating > 5) return;

    this.reviewRating = rating;
    this.reviewSubmitError = '';
  }

  submitReview(): void {
    this.loadCurrentUser();

    if (!this.isLoggedIn) {
      this.reviewSubmitError = 'Please login before submitting a review.';
      return;
    }

    if (!this.product) {
      this.reviewSubmitError = 'Product not found.';
      return;
    }

    if (
      !Number.isInteger(this.reviewRating) ||
      this.reviewRating < 1 ||
      this.reviewRating > 5
    ) {
      this.reviewSubmitError = 'Please select a rating from 1 to 5 stars.';
      return;
    }

    if (this.reviewComment.trim().length > 2000) {
      this.reviewSubmitError = 'Comment must be 2000 characters or fewer.';
      return;
    }

    const token = localStorage.getItem('hafiz_gas_token');

    if (!token) {
      this.reviewSubmitError = 'Login session not found. Please login again.';
      return;
    }

    const payload = {
      rating: this.reviewRating,
      comment: this.reviewComment.trim()
    };

    this.submittingReview = true;
    this.reviewSubmitError = '';
    this.reviewSuccess = '';

    this.submitReviewSubscription?.unsubscribe();

    this.submitReviewSubscription = this.http
      .post<any>(
        `${this.apiUrl}/${encodeURIComponent(String(this.product.id))}/reviews`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )
      .subscribe({
        next: response => {
          this.submittingReview = false;
          this.reviewSuccess =
            response?.message || 'Your review has been saved successfully.';

          this.loadReviews(String(this.product!.id));
          this.cdr.detectChanges();
        },

        error: error => {
          this.submittingReview = false;

          this.reviewSubmitError =
            error?.error?.error ||
            error?.error?.message ||
            'Review submit nahi ho saka. Please try again.';

          this.cdr.detectChanges();
        }
      });
  }

  deleteReview(review: ProductReview): void {
    this.loadCurrentUser();

    if (!this.canDeleteReview(review)) {
      this.reviewSubmitError = 'You are not allowed to delete this review.';
      return;
    }

    if (!this.product) return;

    const confirmed = confirm(
      'Are you sure you want to delete this review?'
    );

    if (!confirmed) return;

    const token = localStorage.getItem('hafiz_gas_token');

    if (!token) {
      this.reviewSubmitError = 'Please login again.';
      return;
    }

    this.deletingReviewId = review.id;
    this.reviewSubmitError = '';

    this.deleteReviewSubscription?.unsubscribe();

    this.deleteReviewSubscription = this.http
      .delete<any>(
        `${this.apiUrl}/${encodeURIComponent(String(this.product.id))}/reviews/${encodeURIComponent(String(review.id))}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )
      .subscribe({
        next: () => {
          this.deletingReviewId = null;

          if (
            String(review.user_id) === String(this.currentUser?.id)
          ) {
            this.reviewRating = 5;
            this.reviewComment = '';
          }

          this.reviewSuccess = 'Review deleted successfully.';

          this.loadReviews(String(this.product!.id));
          this.cdr.detectChanges();
        },

        error: error => {
          this.deletingReviewId = null;

          this.reviewSubmitError =
            error?.error?.error ||
            error?.error?.message ||
            'Review delete nahi ho saka. Please try again.';

          this.cdr.detectChanges();
        }
      });
  }

  // Images
  private prepareImages(product: Product): void {
    let paths: string[] = [];

    if (Array.isArray(product.images)) {
      paths = product.images;
    } else if (typeof product.images === 'string') {
      try {
        paths = JSON.parse(product.images);
      } catch {
        paths = [product.images];
      }
    }

    const mainImage = product.image_url || product.imageUrl || '';

    if (mainImage && !paths.includes(mainImage)) {
      paths.unshift(mainImage);
    }

    this.images = paths
      .filter(Boolean)
      .map(path => this.imageUrl(path));

    this.selectedImage = this.images[0] || '';
  }

  imageUrl(path?: string): string {
    if (!path) return '';

    if (path.startsWith('http')) return path;

    return `${this.serverUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  relatedImage(product: Product): string {
    return this.imageUrl(
      product.image_url || product.imageUrl || ''
    );
  }

  relatedPrice(product: Product): number {
    return Number(product.price ?? 0);
  }

  // Product Options
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

  // Cart
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
      image:
        this.images[0] ||
        this.imageUrl(
          this.product.image_url || this.product.imageUrl || ''
        ),
      price: this.unitPrice,
      quantity: this.quantity,
      color: this.selectedColor,
      size: this.selectedSize,
      gasType: this.selectedGasType
    };

    this.cartServices.addToCart(item);
    this.showSuccessToast();
  }

  buyNow(): void {
    if (!this.product) {
      alert('Product available nahi hai.');
      return;
    }

    if (this.isOutOfStock) {
      alert('Sorry, this product is currently out of stock.');
      return;
    }

    this.addToCart();
    this.router.navigate(['/checkout']);
  }

  formatPrice(value: number): string {
    return value.toLocaleString('en-PK');
  }

  // Cart Toast
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