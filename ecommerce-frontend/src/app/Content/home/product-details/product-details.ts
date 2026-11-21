import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  Component,
  OnInit,
  inject,
  ChangeDetectorRef
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ActivatedRoute,
  Router,
  RouterModule
} from '@angular/router';
import {
  CartItem,
  CartServices
} from '../cart/cartServices/cart-services';
import { environment } from '../../../../environments/environment';

interface ProductOption {
  id: number;
  option_group: string;
  option_value: string;
  extra_price: number;
}

interface Product {
  id: number | string;
  title: string;
  description: string;
  price: number;
  stock: number;
  image_url: string | null;
  images: string[] | string | null;
  category?: string;
  options: ProductOption[];
  average_rating?: number | null;
  review_count?: number;
  reviews?: Review[];
}

interface Review {
  id: number;
  rating: number;
  comment: string;
  created_at: string;
  user_name?: string;
}

interface OptionGroup {
  name: string;
  options: ProductOption[];
}

@Component({
  selector: 'app-product-details',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './product-details.html',
  styleUrl: './product-details.css'
})
export class ProductDetails implements OnInit {
  private readonly apiUrl =
    `${environment.apiUrl}/api/products`;

  private readonly serverUrl =
    `${environment.serverUrl}`;

  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cartService = inject(CartServices);
  private readonly cdr = inject(ChangeDetectorRef);

  product: Product | null = null;
  relatedProducts: Product[] = [];
  images: string[] = [];
  selectedImage = '';

  optionGroups: OptionGroup[] = [];
  selectedOptions: Record<string, ProductOption> = {};

  loading = true;
  pageError = '';
  addingToCart = false;
  cartMessage = '';

  reviews: Review[] = [];
  averageRating = 0;
  reviewCount = 0;
  reviewLoading = false;
  reviewRating = 5;
  reviewComment = '';
  submittingReview = false;
  reviewSuccess = '';
  reviewSubmitError = '';

  readonly stars = [1, 2, 3, 4, 5];

  get isLoggedIn(): boolean {
    return !!localStorage.getItem('hafiz_gas_token');
  }

  get finalPrice(): number {
    if (!this.product) return 0;

    const extras = Object.values(this.selectedOptions)
      .reduce(
        (total, option) => total + Number(option.extra_price || 0),
        0
      );

    return Number(this.product.price || 0) + extras;
  }

  get hasStock(): boolean {
    return Number(this.product?.stock || 0) > 0;
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');

      if (id) {
        this.loadProduct(id);
      } else {
        this.loading = false;
        this.pageError = 'Product ID was not found.';
        this.cdr.markForCheck();
      }
    });
  }

  private loadProduct(id: string): void {
  this.loading = true;
  this.pageError = '';
  this.product = null;

  this.http.get<any>(
    `${this.apiUrl}/${encodeURIComponent(id)}`
  ).subscribe({
    next: response => {
      console.log('PRODUCT API RESPONSE:', response);

      try {
        const data =
          response?.data?.product ??
          response?.data ??
          response?.product ??
          response;

        if (!data || data.id == null) {
          this.product = null;
          this.pageError = 'Product not found.';
          console.error('Invalid product response:', response);
          this.loading = false;
          this.cdr.markForCheck();
          return;
        }

        this.product = data as Product;

        this.images = this.parseImages(
          data.images,
          data.image_url
        );

        this.selectedImage = this.images[0] || '';

        this.buildOptionGroups(
          Array.isArray(data.options) ? data.options : []
        );

        this.loadReviews(String(data.id));
        this.loadRelatedProducts(String(data.id));

      } catch (error) {
        console.error('PRODUCT PROCESSING ERROR:', error);
        this.product = null;
        this.pageError =
          'Product data processing failed. Check browser console.';
      } finally {
        this.loading = false;
        this.cdr.markForCheck();
      }
    },

    error: error => {
      console.error('PRODUCT API ERROR:', error);

      this.pageError =
        `Product request failed. HTTP Status: ${error?.status || 'Unknown'}`;

      this.loading = false;
      this.cdr.markForCheck();
    }
  });
}

  private parseImages(
    rawImages: unknown,
    fallback: string | null
  ): string[] {
    let values: unknown[] = [];

    if (Array.isArray(rawImages)) {
      values = rawImages;
    } else if (
      typeof rawImages === 'string' &&
      rawImages.trim()
    ) {
      try {
        const parsed = JSON.parse(rawImages);

        if (Array.isArray(parsed)) {
          values = parsed;
        } else {
          values = [rawImages];
        }
      } catch {
        values = [rawImages];
      }
    }

    const cleaned = values
      .filter(
        (value): value is string =>
          typeof value === 'string' && !!value.trim()
      )
      .map(value => this.imageUrl(value));

    if (!cleaned.length && fallback) {
      cleaned.push(this.imageUrl(fallback));
    }

    return [...new Set(cleaned)];
  }

  imageUrl(value: string): string {
    if (!value) return '';

    if (/^https?:\/\//i.test(value)) {
      return value;
    }

    return `${this.serverUrl}${value.startsWith('/') ? '' : '/'}${value}`;
  }

  private buildOptionGroups(
    options: ProductOption[]
  ): void {
    const groups = new Map<string, ProductOption[]>();

    for (const option of options) {
      const name = String(option.option_group || '').trim();

      if (!name) continue;

      if (!groups.has(name)) {
        groups.set(name, []);
      }

      groups.get(name)!.push(option);
    }

    this.optionGroups = Array.from(
      groups,
      ([name, groupOptions]) => ({
        name,
        options: groupOptions
      })
    );

    this.selectedOptions = {};

    for (const group of this.optionGroups) {
      if (group.options.length) {
        this.selectedOptions[group.name] = group.options[0];
      }
    }
  }

  onOptionChange(
    groupName: string,
    optionId: string
  ): void {
    const group = this.optionGroups.find(
      item => item.name === groupName
    );

    const option = group?.options.find(
      item => String(item.id) === String(optionId)
    );

    if (option) {
      this.selectedOptions = {
        ...this.selectedOptions,
        [groupName]: option
      };

      this.cartMessage = '';
    }
  }

  selectImage(image: string): void {
    this.selectedImage = image;
  }

  addToCart(): void {
    if (
      !this.product ||
      !this.hasStock ||
      this.addingToCart
    ) {
      return;
    }

    const selected: Record<string, string> = {};

    for (
      const [group, option]
      of Object.entries(this.selectedOptions)
    ) {
      selected[group.toLowerCase()] = option.option_value;
    }

    const item: CartItem = {
      id: `${this.product.id}-${Date.now()}`,
      productId: this.product.id,
      name: this.product.title,
      image: this.selectedImage ||
        this.imageUrl(this.product.image_url || ''),
      price: this.finalPrice,
      quantity: 1,
      color: selected['color'],
      size: selected['size'],
      gasType: selected['gas type']
    };

    this.addingToCart = true;

    this.cartService.addToCart(item);

    this.cartMessage = 'Product added to cart.';
    this.addingToCart = false;
  }

  private loadRelatedProducts(
    currentId: string
  ): void {
    this.http.get<any>(this.apiUrl).subscribe({
      next: response => {
        const rows = Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response?.products)
            ? response.products
            : Array.isArray(response)
              ? response
              : [];

        this.relatedProducts = rows
          .filter(
            (item: Product) =>
              String(item.id) !== currentId
          )
          .slice(0, 12)
          .map((item: Product) => ({
            ...item,
            images: this.parseImages(
              item.images,
              item.image_url
            )
          }));

        this.cdr.markForCheck();
      },

      error: error => {
        console.error(
          'Unable to load related products:',
          error
        );

        this.relatedProducts = [];
        this.cdr.markForCheck();
      }
    });
  }

  relatedImage(product: Product): string {
    const images = Array.isArray(product.images)
      ? product.images
      : [];

    return images[0] ||
      (
        product.image_url
          ? this.imageUrl(product.image_url)
          : ''
      );
  }

  openRelatedProduct(
    id: number | string
  ): void {
    this.router.navigate(['/product-details', id]);

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  private loadReviews(productId: string): void {
    this.reviewLoading = true;

    this.http.get<any>(
      `${this.apiUrl}/${productId}/reviews`
    ).subscribe({
      next: response => {
        const payload = response?.data ?? response;

        this.reviews = Array.isArray(payload?.reviews)
          ? payload.reviews
          : Array.isArray(payload)
            ? payload
            : Array.isArray(this.product?.reviews)
              ? this.product!.reviews!
              : [];

        const average =
          payload?.average_rating ??
          this.product?.average_rating;

        this.averageRating = Number(average || 0);

        this.reviewCount = Number(
          payload?.review_count ?? this.reviews.length
        );

        this.reviewLoading = false;
        this.cdr.markForCheck();
      },

      error: error => {
        console.error(
          'Unable to load reviews:',
          error
        );

        this.reviews = Array.isArray(this.product?.reviews)
          ? this.product!.reviews!
          : [];

        this.reviewCount = this.reviews.length;

        this.averageRating = Number(
          this.product?.average_rating || 0
        );

        this.reviewLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  setReviewRating(rating: number): void {
    this.reviewRating = rating;
  }

  submitReview(): void {
    if (
      !this.product ||
      !this.isLoggedIn ||
      this.submittingReview
    ) {
      return;
    }

    const comment = this.reviewComment.trim();

    if (!comment) {
      this.reviewSubmitError = 'Please write your review.';
      return;
    }

    this.submittingReview = true;
    this.reviewSubmitError = '';
    this.reviewSuccess = '';

    const token = localStorage.getItem('hafiz_gas_token');

    this.http.post<any>(
      `${this.apiUrl}/${this.product.id}/reviews`,
      {
        rating: this.reviewRating,
        comment
      },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    ).subscribe({
      next: () => {
        this.reviewComment = '';
        this.reviewRating = 5;

        this.reviewSuccess =
          'Your review has been submitted.';

        this.submittingReview = false;
        this.cdr.markForCheck();

        this.loadReviews(String(this.product!.id));
      },

      error: error => {
        console.error(
          'Unable to submit review:',
          error
        );

        this.reviewSubmitError =
          error?.error?.message ||
          'Unable to submit your review. You may have already reviewed this product.';

        this.submittingReview = false;
        this.cdr.markForCheck();
      }
    });
  }

  goToLogin(): void {
    this.router.navigate(
      ['/login'],
      {
        queryParams: {
          returnUrl: this.router.url
        }
      }
    );
  }

  formatDate(value: string): string {
    if (!value) return '';

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString(
          'en-PK',
          {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          }
        );
  }

  ratingStars(rating: number): number[] {
    return this.stars.filter(
      star => star <= Math.round(Number(rating || 0))
    );
  }
}
