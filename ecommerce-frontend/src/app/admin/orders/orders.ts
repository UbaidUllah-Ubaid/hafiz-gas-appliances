import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { timeout } from 'rxjs';

interface OrderItem {
  title?: string;
  product_title?: string;
  quantity?: number;
  unit_price?: number;
  selected_options?: Record<string, string>;
}

interface CustomerOrder {
  id: number;
  user_id: number;
  status: string;
  total_price: number;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  shipping_address?: string;
  created_at?: string;
  items: OrderItem[];
}

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './orders.html',
  styleUrl: './orders.css'
})
export class Orders implements OnInit {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef)
  readonly Object = Object;

  private readonly apiUrl = 'http://https://hafiz-gas-appliances.onrender.com/api/orders';

  orders: CustomerOrder[] = [];
  loading = false;
  updatingOrderId: number | null = null;
  errorMessage = '';
  successMessage = '';

  ngOnInit(): void {
    this.loadOrders();
  }

  get pendingOrders(): CustomerOrder[] {
    return this.orders.filter(order =>
      order.status.toLowerCase() === 'pending'
    );
  }

  get confirmedOrders(): CustomerOrder[] {
    return this.orders.filter(order =>
      ['confirmed', 'processing', 'shipped'].includes(
        order.status.toLowerCase()
      )
    );
  }

  get completedOrders(): CustomerOrder[] {
    return this.orders.filter(order =>
      ['delivered', 'cancelled'].includes(
        order.status.toLowerCase()
      )
    );
  }

loadOrders(): void {
  const token = localStorage.getItem('hafiz_gas_token');

  if (!token) {
    console.log('Orders count:', this.orders.length);
console.log('Loading before stop:', this.loading);
this.loading = false;
console.log('Loading after stop:', this.loading);
    this.errorMessage = 'Please log in to your admin account.';
    return;
  }

  this.loading = true;
  this.errorMessage = '';
  this.successMessage = '';

  const url = `${this.apiUrl.replace(/\/$/, '').replace(/\/api\/orders$/, '/api/admin/orders')}`;

  this.http.get<any>(url, {
    headers: { Authorization: `Bearer ${token}` }
  }).pipe(
    timeout(15000)
  ).subscribe({
    next: response => {
      console.log('Admin orders API response:', response);

      const data = Array.isArray(response)
        ? response
        : response?.orders ?? response?.data ?? [];

      this.orders = data.map((order: any) => ({
        ...order,
        id: Number(order.id),
        user_id: Number(order.user_id),
        status: String(order.status || 'pending').toLowerCase(),
        total_price: Number(order.total_price || 0),
        items: Array.isArray(order.items) ? order.items : []
      }));

      this.loading = false;
this.cdr.detectChanges();

console.log('Orders count:', this.orders.length);
console.log('Loading state:', this.loading);
    },
    error: error => {
      console.error('Admin orders API error:', error);
      this.loading = false;
      this.errorMessage = error.name === 'TimeoutError'
        ? 'Orders request timed out. Check that the backend is running.'
        : this.getErrorMessage(error);
    }
  });
}

  updateStatus(order: CustomerOrder, status: 'confirmed' | 'delivered'): void {
    const token = localStorage.getItem('hafiz_gas_token');

    if (!token || this.updatingOrderId !== null) {
      return;
    }

    const confirmation = status === 'confirmed'
      ? `Confirm Order #${order.id}?`
      : `Mark Order #${order.id} as received by the customer?`;

    if (!window.confirm(confirmation)) {
      return;
    }

    this.updatingOrderId = order.id;
    this.errorMessage = '';
    this.successMessage = '';

    this.http.patch(
      `${this.apiUrl}/${order.id}/status`,
      { status },
      { headers: { Authorization: `Bearer ${token}` } }
    ).subscribe({
      next: () => {
        this.updatingOrderId = null;
        this.cdr.detectChanges();
        this.successMessage = status === 'confirmed'
          ? `Order #${order.id} confirmed successfully.`
          : `Order #${order.id} marked as received.`;

        this.loadOrders();
      },
      error: error => {
        this.updatingOrderId = null;
        this.cdr.detectChanges();
        this.errorMessage = this.getErrorMessage(error);
      }
    });
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-PK', {
      maximumFractionDigits: 0
    }).format(price);
  }

  formatDate(date?: string): string {
    if (!date) return 'Date unavailable';

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) return date;

    return parsed.toLocaleString('en-PK', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  getProductName(item: OrderItem): string {
    return item.title || item.product_title || 'Product';
  }

  getErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 401 || error.status === 403) {
      return 'Admin access denied. Please log in again with an admin account.';
    }

    if (error.status === 0) {
      return 'Cannot connect to the backend. Make sure the server is running.';
    }

    if (error.status === 404) {
      return 'Orders API not found. Check the backend routes.';
    }

    return error.error?.error ||
      `Unable to complete the request (Error ${error.status}).`;
  }
}