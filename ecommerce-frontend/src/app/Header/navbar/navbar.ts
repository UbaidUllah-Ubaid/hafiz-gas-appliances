import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  HostListener
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { Subscription } from 'rxjs';

import { CartServices } from '../../Content/home/cart/cartServices/cart-services';
import { Product, ProductService } from '../../sevices/product';
// import { ProductService, Product } from '../../product-services/product-service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrl: './navbar.css',
  templateUrl: './navbar.html',
})
export class Navbar implements OnInit, OnDestroy {

  private router = inject(Router);
  private cartService = inject(CartServices);
  // private productService = inject(ProductService);
  private productService = inject(ProductService);
  private cdr = inject(ChangeDetectorRef);

  private productSubscription?: Subscription;
  private cartSubscription?: Subscription;

  isMenuOpen = false;
  activeLink = 'Home';

  cartItemCount = 0;

  searchQuery = '';
  allProducts: Product[] = [];
  filteredProducts: Product[] = [];

  showSearchResults = false;
  searching = false;

  private serverUrl = 'http://https://hafiz-gas-appliances.onrender.com';

  ngOnInit(): void {
    this.loadProducts();
    this.cartSubscription = this.cartService.cart$.subscribe(cartItems => {
      this.cartItemCount = cartItems.reduce((total, item) => total + item.quantity, 0);
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy(): void {
    this.productSubscription?.unsubscribe();
    this.cartSubscription?.unsubscribe();
  }

  loadProducts(): void {
    this.searching = true;

    this.productSubscription = this.productService.getProducts().subscribe({
      next: (response: any) => {

        const products = Array.isArray(response)
          ? response
          : response?.data || response?.products || [];

        this.allProducts = products.filter((product: Product) =>
          product.is_published === true ||
          Number(product.is_published) === 1
        );

        this.searching = false;
        this.cdr.detectChanges();
      },

      error: (error) => {
        console.error('Products loading error:', error);
        this.searching = false;
        this.cdr.detectChanges();
      }
    });
  }

  toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
  }

  setActive(linkName: string): void {
    this.activeLink = linkName;
    this.isMenuOpen = false;
  }

  onSearch(): void {
    const query = this.searchQuery.trim().toLowerCase();

    if (!query) {
      this.filteredProducts = [];
      this.showSearchResults = false;
      return;
    }

    this.filteredProducts = this.allProducts.filter(product => {
      const title = String(product.title || '').toLowerCase();
      const category = String(product.category || '').toLowerCase();
      const sku = String(product.sku || '').toLowerCase();

      return (
        title.includes(query) ||
        category.includes(query) ||
        sku.includes(query)
      );
    });

    this.showSearchResults = true;
    this.isMenuOpen = false;

    this.cdr.detectChanges();
  }

  onSearchInput(): void {
    if (!this.searchQuery.trim()) {
      this.filteredProducts = [];
      this.showSearchResults = false;
      return;
    }

    this.onSearch();
  }

  openProduct(product: Product): void {
    this.showSearchResults = false;
    this.searchQuery = '';
    this.filteredProducts = [];

    this.router.navigate(['/products', product.id]);
  }

  imageUrl(product: Product): string {
    let image = product.image_url || product.imageUrl || '';

    if (!image && product.images) {
      if (Array.isArray(product.images)) {
        image = product.images[0] || '';
      } else {
        try {
          const parsed = JSON.parse(product.images);
          image = Array.isArray(parsed) ? parsed[0] || '' : product.images;
        } catch {
          image = product.images;
        }
      }
    }

    if (!image) return '';

    if (image.startsWith('http')) return image;

    return `${this.serverUrl}${image.startsWith('/') ? '' : '/'}${image}`;
  }

  formatPrice(price: number): string {
    return Number(price || 0).toLocaleString('en-PK');
  }

  closeSearch(): void {
    this.showSearchResults = false;
  }

  logout(): void {
    localStorage.removeItem('hafiz_gas_token');
    localStorage.removeItem('hafiz_gas_user');

    this.router.navigate(['/']);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.showSearchResults = false;
  }

  stopSearchClose(event: Event): void {
    event.stopPropagation();
  }
}