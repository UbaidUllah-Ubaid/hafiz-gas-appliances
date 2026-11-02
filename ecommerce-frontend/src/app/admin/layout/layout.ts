import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './layout.html',
  styleUrl: './layout.css',
})
export class Layout {
  private router = inject(Router);

  mobileMenuOpen = false;

  toggleSidebar(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeSidebar(): void {
    this.mobileMenuOpen = false;
  }

  logout(): void {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('hafiz_gas_token');
    this.router.navigate(['/login']);
  }
}