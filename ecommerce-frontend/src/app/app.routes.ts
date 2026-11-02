import { Routes } from '@angular/router';
import { Home } from './Content/home/home';
import { AdminLogin } from './admin/admin-login/admin-login';
import { Dashboard } from './admin/dashboard/dashboard';
import { authGuard } from './admin/auth-guard';
import { Products } from './admin/products/products';
import { Layout } from './admin/layout/layout';
import { AddProduct } from './admin/add-product/add-product';
import { ProductDetails } from './Content/home/product-details/product-details';
import { Cart } from './Content/home/cart/cart';
import { Customerlogin } from './customers/customerlogin/customerlogin';
import { Orders } from './admin/orders/orders';
import { MyOrders } from './Content/home/myorders/myorders';
import { ProductsUpdate } from './admin/product-update/product-update';
import { Profile } from './customers/customerlogin/profile/profile';
import { Contact } from './Content/home/contact/contact';
import { About } from './Content/home/about/about';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'myorders', component: MyOrders },
  { path: 'about', component: About },
  { path: 'contact', component: Contact },
  { path: 'productsDetails', component: ProductDetails },
  { path: 'cart', component: Cart },
  { path: 'profile', component: Profile },
  { path: 'customerlogin', component: Customerlogin },
  { path: 'products/:id', component: ProductDetails },
  { path: 'login', component: AdminLogin },

 { path: 'admin', component: Layout, canActivate: [authGuard],
  children: [
    { path: 'dashboard', component: Dashboard },
    { path: 'products', component: Products },
    { path: 'addProduct', component: AddProduct },
    { path: 'orders', component: Orders },
    { path: 'productUpdate', component: ProductsUpdate },
    { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
  ]
},

  { path: '**', redirectTo: '' }
];