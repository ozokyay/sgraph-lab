import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VisLineChartComponent } from './vis-line-chart.component';

describe('VisLineChartComponent', () => {
  let component: VisLineChartComponent;
  let fixture: ComponentFixture<VisLineChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VisLineChartComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VisLineChartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
