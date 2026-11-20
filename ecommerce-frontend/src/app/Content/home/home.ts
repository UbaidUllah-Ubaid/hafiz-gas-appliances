import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  ChangeDetectorRef
} from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { Subscription } from 'rxjs';

interface HeroProduct {
  id: number | string;
  name: string;
  imageUrl: string;
  description?: string;
  price: number;
  averageRating: number;
  reviewCount: number;
  showRating: boolean;
  options: {
    option_group: string;
    option_value: string;
    extra_price?: number;
  }[];
}

interface ApiProduct {
  id: number | string;
  title?: string;
  name?: string;
  image_url?: string;
  imageUrl?: string;
  description?: string;
  price?: number | string;
  average_rating?: number | string;
  review_count?: number | string;
  show_rating?: boolean | number;
  options?: {
    option_group?: string;
    option_value?: string;
    extra_price?: number | string;
  }[];
  is_published?: boolean | number;
}

interface ProductsResponse {
  data: ApiProduct[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  styleUrl: './home.css',
  templateUrl: './home.html',
})
export class Home implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private request?: Subscription;
  private timer?: ReturnType<typeof setInterval>;
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);

  // Backend API URL
  private readonly apiUrl =
    'http://localhost:3000/api/products';

  heroProducts: HeroProduct[] = [];
  currentIndex = 0;
  loading = true;
  errorMessage = '';

  ngOnInit(): void {
    this.loadHeroProducts();
  }

  loadHeroProducts(): void {
    this.loading = true;
    this.errorMessage = '';

    this.request = this.http.get<ProductsResponse>(this.apiUrl).subscribe({
      next: (response) => {
        console.log('API RESPONSE:', response);
        console.log('RESPONSE DATA:', response?.data);

        const products = Array.isArray(response?.data)
          ? response.data
          : [];

        this.heroProducts = products.map((product) => ({
          id: product.id,
          name: product.title || product.name || 'Product',
          imageUrl: product.image_url || product.imageUrl || '',
          description: product.description || '',
          price: Number(product.price || 0),

          averageRating: Number(product.average_rating || 0),
          reviewCount: Number(product.review_count || 0),

          showRating:
            (product.show_rating === true ||
              product.show_rating === 1) &&
            Number(product.average_rating || 0) >= 4 &&
            Number(product.review_count || 0) >= 3,

          options: (product.options || []).map((option) => ({
            option_group: option.option_group || 'Option',
            option_value: option.option_value || '',
            extra_price: Number(option.extra_price || 0)
          }))
        }));

        this.loading = false;
        this.cdr.detectChanges();
        this.startAutoSlide();

        console.log('Products count:', this.heroProducts.length);
      },
      error: (error) => {
        console.error('PRODUCT API ERROR:', error);
        this.errorMessage =
          `API error: ${error.status} ${error.statusText || ''}`;
        this.loading = false;
      }
    });
  }

  startAutoSlide(): void {
    this.stopAutoSlide();

    if (this.heroProducts.length < 2) {
      return;
    }

    this.timer = setInterval(() => {
      this.nextSlide();
    }, 3000);
  }

  nextSlide(): void {
    if (this.heroProducts.length < 2) {
      return;
    }

    this.currentIndex =
      (this.currentIndex + 1) % this.heroProducts.length;
  }

  previousSlide(): void {
    if (this.heroProducts.length < 2) {
      return;
    }

    this.currentIndex =
      (this.currentIndex - 1 + this.heroProducts.length) %
      this.heroProducts.length;
  }

  goToSlide(index: number): void {
    if (index < 0 || index >= this.heroProducts.length) {
      return;
    }

    this.currentIndex = index;
  }

  private stopAutoSlide(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  ngOnDestroy(): void {
    this.stopAutoSlide();
    this.request?.unsubscribe();
  }

  orderNow(productId: number | string): void {
    this.router.navigate(['/products', productId]);
  }
}