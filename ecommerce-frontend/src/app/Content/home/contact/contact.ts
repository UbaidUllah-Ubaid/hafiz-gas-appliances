import { Component } from '@angular/core';

interface ContactNumber {
  number: string;
  display: string;
  label: string;
  whatsappUrl: string;
}

@Component({
  selector: 'app-contact',
  standalone: true,
  templateUrl: './contact.html',
  styleUrl: './contact.css'
})
export class Contact {
  readonly email = 'hafizgastandoors@gmail.com';

  readonly facebookUrl = 'https://www.facebook.com/YOUR_PAGE';
  readonly tiktokUrl = 'https://www.tiktok.com/@YOUR_USERNAME';

  readonly contacts: ContactNumber[] = [
    {
      number: '923164431138',
      display: '+92 316 4431138',
      label: 'WhatsApp Contact 01',
      whatsappUrl: 'https://wa.me/923164431138'
    },
    {
      number: '923004968410',
      display: '+92 300 4968410',
      label: 'WhatsApp Contact 02',
      whatsappUrl: 'https://wa.me/923004968410'
    },
    {
      number: '923334968410',
      display: '+92 333 4968410',
      label: 'WhatsApp Contact 03',
      whatsappUrl: 'https://wa.me/923334968410'
    },
    {
      number: '923164552438',
      display: '+92 316 4552438',
      label: 'WhatsApp Contact 04',
      whatsappUrl: 'https://wa.me/923164552438'
    }
  ];
}