
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Product {
  id: number;
  title: string;
  sku: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  is_published: number | boolean;
  image_url?: string;
  imageUrl?: string;
  images?: string[] | string;
}

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private http = inject(HttpClient);

  private apiUrl = `${environment.apiUrl}/api/products`;

  getProducts(): Observable<Product[]> {
    return this.http.get<Product[]>(this.apiUrl);
  }
}
