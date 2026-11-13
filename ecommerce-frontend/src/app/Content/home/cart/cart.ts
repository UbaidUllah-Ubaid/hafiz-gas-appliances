import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { FormsModule, NgForm } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { CartItem, CartServices } from './cartServices/cart-services';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './cart.html',
  styleUrl: './cart.css'
})
export class Cart implements OnInit {
  private cartService = inject(CartServices);
  private router = inject(Router);
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef)

  showCheckout = false;
  customerName = '';
  customerPhone = '';
  customerCity = '';
  customerAddress = '';
  paymentMethod = 'Cash on Delivery';

  submittingOrder = false;
  orderMessage = '';
  orderError = '';

  items: CartItem[] = [];
  readonly serverUrl = 'https://hafiz-gas-appliances-backend.onrender.com';

  ngOnInit(): void {
    this.cartService.cart$.subscribe(items => {
      this.items = items.map(item => ({ ...item }));
    });
  }

  saveCart(): void {}

  get totalItems(): number {
    return this.items.reduce((total, item) => total + item.quantity, 0);
  }

  get subtotal(): number {
    return this.items.reduce(
      (total, item) => total + item.price * item.quantity,
      0
    );
  }

  getImage(image: string): string {
    if (!image) return 'assets/images/product-placeholder.png';

    if (
      image.startsWith('http://') ||
      image.startsWith('https://') ||
      image.startsWith('data:') ||
      image.startsWith('assets/')
    ) {
      return image;
    }

    return `${this.serverUrl}/${image.replace(/^\/+/, '')}`;
  }

  increase(item: CartItem): void {
    this.cartService.increase(item.id);
  }

  decrease(item: CartItem): void {
    this.cartService.decrease(item.id);
  }

  removeItem(id: string): void {
    this.cartService.removeItem(id);
  }

  clearCart(): void {
    this.cartService.clearCart();
  }

  trackById(index: number, item: CartItem): string {
    return item.id;
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-PK', {
      maximumFractionDigits: 0
    }).format(price);
  }

  goToCheckout(): void {
    const token = localStorage.getItem('hafiz_gas_token');

    if (!token) {
      this.router.navigate(['/customerlogin'], {
        state: { returnUrl: '/cart' }
      });
      return;
    }

    if (!this.items.length) return;

    this.orderMessage = '';
    this.orderError = '';
    this.showCheckout = true;
  }

  confirmOrder(): void {


    if (this.submittingOrder) return;

    const token = localStorage.getItem('hafiz_gas_token');

    if (!token) {
      this.router.navigate(['/customerlogin'], {
        state: { returnUrl: '/cart' }
      });
      return;
    }

    if (
      !this.customerName.trim() ||
      !this.customerPhone.trim() ||
      !this.customerCity.trim() ||
      !this.customerAddress.trim() ||
      this.items.length === 0
    ) {
      this.orderError = 'Please complete all delivery details.';
      return;
    }

    const orderItems = this.items.map(item => {
      const selectedOptions: Record<string, string> = {};

      if (item.color) selectedOptions['color'] = item.color;
      if (item.size) selectedOptions['size'] = item.size;
      if (item.gasType) selectedOptions['gas type'] = item.gasType;

      return {
        product_id: Number(item.productId),
        quantity: item.quantity,
        selected_options: selectedOptions
      };
    });

    if (orderItems.some(item =>
      !Number.isInteger(item.product_id) || item.product_id < 1
    )) {
      this.orderError =
        'A product has an invalid database ID. Please remove it and add it again.';
      return;
    }

    const payload = {
      items: orderItems,
      customer_name: this.customerName.trim(),
      customer_phone: this.customerPhone.trim(),
      shipping_address:
        `${this.customerCity.trim()}, ${this.customerAddress.trim()}`,
      notes: `Payment method: ${this.paymentMethod}`
    };

  this.submittingOrder = true;
  console.log('STEP 1: Starting order request');
this.orderError = '';
this.orderMessage = '';

// Close checkout popup immediately
this.showCheckout = false;
console.log('STEP 2: Sending order to backend', payload);

    this.http.post<any>(
      `${this.serverUrl}/api/orders`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Idempotency-Key':
            `hafiz-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        }
      }
    ).subscribe({
      next: (response) => {
        console.log('STEP 3: ORDER SUCCESS', response);
        this.submittingOrder = false;

        const orderId = response?.id;

        const orderDetails = this.items.map((item, index) => {
          const variations = [
            item.color ? `Color: ${item.color}` : '',
            item.size ? `Size: ${item.size}` : '',
            item.gasType ? `Gas: ${item.gasType}` : ''
          ].filter(Boolean).join(', ');

          return `${index + 1}. ${item.name}
${variations ? variations + '\n' : ''}Quantity: ${item.quantity}
Price shown in cart: Rs. ${this.formatPrice(item.price)}
Quantity total: Rs. ${this.formatPrice(item.price * item.quantity)}`;
        }).join('\n\n');

        const message = `NEW ORDER - HAFIZ GAS APPLIANCES
Website Order ID: ${orderId ?? 'Saved order'}

Customer: ${this.customerName.trim()}
Phone: ${this.customerPhone.trim()}
City: ${this.customerCity.trim()}
Address: ${this.customerAddress.trim()}
Payment: ${this.paymentMethod}

ORDER DETAILS
${orderDetails}

Website order total: Rs. ${this.formatPrice(Number(response?.total_price ?? this.subtotal))}
Delivery charges: To be confirmed

Please confirm product availability and delivery charges.`;

        const whatsappNumber = '923164431138';
const whatsappUrl =
  `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

// Stop loading
this.submittingOrder = false;

this.orderMessage =
  `Order #${orderId ?? ''} saved successfully! Please send your order details on WhatsApp.`;

this.whatsappUrlForRetry = whatsappUrl;

// Clear cart and refresh the view immediately
this.cartService.clearCart();
this.items = [];
this.cdr.detectChanges();

console.log('Order confirmed:', orderId);
console.log('Cart after clearing:', this.cartService.getItems());
// this.showCheckout = false;

// Open WhatsApp
// WhatsApp automatically open nahi hoga
this.whatsappUrlForRetry = whatsappUrl;
      },
      error: (error: HttpErrorResponse) => {
        console.log('ORDER ERROR RESPONSE:', error.error);
        this.submittingOrder = false;
          console.log('STEP 4: ORDER FAILED', error);
        // this.showCheckout = true;

        const backendMessage =
          error.error?.error || error.error?.message;

        this.orderError = backendMessage
          ? `Order save nahi hua: ${backendMessage}`
          : 'Order save nahi hua. Backend connection aur login check karein.';
      }
    });
  }

  whatsappUrlForRetry = '';

  openWhatsApp(): void {
  if (this.whatsappUrlForRetry) {
    window.open(this.whatsappUrlForRetry, '_blank');
  }
}
}
