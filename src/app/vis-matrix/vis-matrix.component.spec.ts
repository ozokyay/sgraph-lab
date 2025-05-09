import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VisMatrixComponent } from './vis-matrix.component';

describe('VisMatrixComponent', () => {
  let component: VisMatrixComponent;
  let fixture: ComponentFixture<VisMatrixComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VisMatrixComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VisMatrixComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
