import { Component, OnInit, inject,ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';

interface Product {
  id: number;
  title: string;
  sku: string;
  description: string;
  price: number;
  stock: number;
  image_url: string;
  category: string;
  is_published: boolean;
}

interface ProductsResponse {
  data: Product[];
  pagination: {
    total: number;
    page: number;
    totalPages: number;
  };
}

@Component({
  selector: 'app-products',
  standalone: true,
  templateUrl: './products.html',
  styleUrl: './products.css',
})
export class Products implements OnInit {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  products: Product[] = [];
  loading = true;
  error = '';

  ngOnInit(): void {
  console.log('1. Products component started');

  this.http
    .get<ProductsResponse>('https://hafiz-gas-appliances-backend.onrender.com/api/products')
    .subscribe({
      next: (response) => {
        console.log('2. Products response:', response);

        this.products = response.data;
        this.loading = false;

        console.log('3. Products count:', this.products.length);

        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Products API failed:', err);

        this.error = 'Products load nahi ho sake.';
        this.loading = false;

        this.cdr.detectChanges();
      },
      complete: () => {
        console.log('4. Products request completed');
      },
    });
}
}