import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VisContainerComponent } from './vis-container.component';

describe('VisContainerComponent', () => {
  let component: VisContainerComponent;
  let fixture: ComponentFixture<VisContainerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VisContainerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VisContainerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
