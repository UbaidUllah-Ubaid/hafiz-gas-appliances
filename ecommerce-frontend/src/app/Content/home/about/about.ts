import { Component } from '@angular/core';

@Component({
  selector: 'app-about',
  standalone: true,
  templateUrl: './about.html',
  styleUrl: './about.css'
})
export class About {
  readonly values = [
    {
      number: '01',
      title: 'In-House Manufacturing',
      description: 'We build our tandoors ourselves, with attention to every detail throughout the manufacturing process.',
      icon: '⚒'
    },
    {
      number: '02',
      title: 'Quality Materials',
      description: 'We focus on carefully selected materials and solid construction to create reliable gas appliances.',
      icon: '◆'
    },
    {
      number: '03',
      title: 'Skilled Workmanship',
      description: 'Our products are made with practical experience, careful workmanship and a commitment to quality.',
      icon: '✦'
    },
    {
      number: '04',
      title: 'Customer Focus',
      description: 'We aim to understand our customers’ needs and provide products that meet their everyday requirements.',
      icon: '♧'
    }
  ];
}