import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VisLevelComponent } from './vis-level.component';

describe('VisLevelComponent', () => {
  let component: VisLevelComponent;
  let fixture: ComponentFixture<VisLevelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VisLevelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VisLevelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
