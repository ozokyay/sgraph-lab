import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TabStatisticsComponent } from './tab-statistics.component';

describe('TabStatisticsComponent', () => {
  let component: TabStatisticsComponent;
  let fixture: ComponentFixture<TabStatisticsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabStatisticsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TabStatisticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
