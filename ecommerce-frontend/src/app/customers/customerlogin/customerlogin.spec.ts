import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Customerlogin } from './customerlogin';

describe('Customerlogin', () => {
  let component: Customerlogin;
  let fixture: ComponentFixture<Customerlogin>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Customerlogin],
    }).compileComponents();

    fixture = TestBed.createComponent(Customerlogin);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
