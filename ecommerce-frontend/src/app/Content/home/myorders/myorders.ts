import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { RouterModule } from '@angular/router';

interface OrderItem {
  product_title?: string;
  quantity?: number;
  unit_price?: number;
}

interface CustomerOrder {
  id: number;
  status: string;
  total_price: number;
  created_at?: string;
  items?: OrderItem[];
}

@Component({
  selector: 'app-myorders',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './myorders.html',
  styleUrl: './myorders.css'
})
export class MyOrders implements OnInit {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef)

  private readonly apiUrl = 'http://https://hafiz-gas-appliances.onrender.com/api/orders/my-orders';

  orders: CustomerOrder[] = [];
  loading = true;
  errorMessage = '';

  ngOnInit(): void {
    this.loadOrders();
  }

  loadOrders(): void {
    const token = localStorage.getItem('hafiz_gas_token');

    if (!token) {
      this.loading = false;
      this.errorMessage = 'Please log in to view your orders.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.http.get<any>(this.apiUrl, {
      headers: { Authorization: `Bearer ${token}` }
    }).subscribe({
      next: (response) => {
        const data = Array.isArray(response)
          ? response
          : response?.orders ?? response?.data ?? [];

        this.orders = data.map((order: any) => ({
          ...order,
          id: Number(order.id),
          status: String(order.status || 'pending').toLowerCase(),
          total_price: Number(order.total_price || 0),
          items: Array.isArray(order.items) ? order.items : []
        }));
        console.log(this.orders);

        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        this.cdr.detectChanges();

        this.errorMessage = error.status === 401 || error.status === 403
          ? 'Your login session may have expired. Please log in again.'
          : 'Orders load nahi ho sake. Please try again.';
      }
    });
  }

  get totalOrders(): number {
    return this.orders.length;
  }

  get processingOrders(): number {
    return this.orders.filter(order =>
      ['pending', 'confirmed', 'processing', 'shipped'].includes(order.status)
    ).length;
  }

  get receivedOrders(): number {
    return this.orders.filter(order =>
      order.status === 'delivered'
    ).length;
  }

  getStatusLabel(status: string): string {
    if (status === 'delivered') return 'Received';
    if (status === 'cancelled') return 'Cancelled';

    // Customer ko non-delivered orders Processing ke naam se dikhayein.
    return 'Processing';
  }

  getStatusClass(status: string): string {
    if (status === 'delivered') return 'received';
    if (status === 'cancelled') return 'cancelled';
    return 'processing';
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-PK', {
      maximumFractionDigits: 0
    }).format(price);
  }

  formatDate(date?: string): string {
    if (!date) return 'Date unavailable';

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) return date;

    return parsedDate.toLocaleDateString('en-PK', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  trackByOrderId(index: number, order: CustomerOrder): number {
    return order.id;
  }
}