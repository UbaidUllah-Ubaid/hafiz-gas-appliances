import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';

export interface CartItem {
  id: string;
  productId: string | number;
  name: string;
  image: string;
  price: number;
  quantity: number;
  color?: string;
  size?: string;
  gasType?: string;
}

interface SavedCartResponse {
  items: CartItem[];
}

@Injectable({
  providedIn: 'root'
})
export class CartServices {
  private readonly storageKey = 'hafiz_gas_cart';
  private readonly apiUrl = `${environment.apiUrl}/api/cart`;

  private http = inject(HttpClient);

  private cartSubject = new BehaviorSubject<CartItem[]>(
    this.loadCart()
  );

  cart$ = this.cartSubject.asObservable();

  private loadCart(): CartItem[] {
    try {
      const saved = localStorage.getItem(this.storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }

  getItems(): CartItem[] {
    return this.cartSubject.value;
  }

  private saveLocal(items: CartItem[]): void {
    localStorage.setItem(this.storageKey, JSON.stringify(items));
    this.cartSubject.next(items);
  }

  private saveToServer(items: CartItem[]): void {
    const token = localStorage.getItem('hafiz_gas_token');

    if (!token) return;

    this.http.put(
      this.apiUrl,
      { items },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    ).subscribe({
      error: (error) => {
        console.error('Unable to sync cart with server:', error);
      }
    });
  }

  // Call after customer logs in or registers.
  // Server cart is the source of truth after login.
  syncWithServer(): void {
    const token = localStorage.getItem('hafiz_gas_token');

    if (!token) return;

    this.http.get<SavedCartResponse>(
      this.apiUrl,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    ).subscribe({
      next: (response) => {
        const serverItems = Array.isArray(response.items)
          ? response.items
          : [];

        // Use the server cart instead of merging stale local items.
        this.saveLocal(serverItems);
      },
      error: (error) => {
        console.error('Unable to load saved cart:', error);
      }
    });
  }

  private save(items: CartItem[]): void {
    this.saveLocal(items);
    this.saveToServer(items);
  }

  addToCart(item: CartItem): void {
    const items = this.getItems().map(existing => ({ ...existing }));

    const existing = items.find(existingItem =>
      String(existingItem.productId) === String(item.productId) &&
      existingItem.color === item.color &&
      existingItem.size === item.size &&
      existingItem.gasType === item.gasType
    );

    if (existing) {
      existing.quantity += item.quantity;
    } else {
      items.push({ ...item });
    }

    this.save(items);
  }

  increase(id: string): void {
    const items = this.getItems().map(item =>
      item.id === id
        ? { ...item, quantity: item.quantity + 1 }
        : item
    );

    this.save(items);
  }

  decrease(id: string): void {
    const items = this.getItems().map(item =>
      item.id === id
        ? { ...item, quantity: Math.max(1, item.quantity - 1) }
        : item
    );

    this.save(items);
  }

 removeItem(id: string): void {
  console.log('Removing cart item ID:', id);

  const updatedItems = this.getItems().filter(
    item => item.id !== id
  );

  console.log('Cart after removal:', updatedItems);

  this.save(updatedItems);
}

  clearCart(): void {
    this.save([]);
  }
}