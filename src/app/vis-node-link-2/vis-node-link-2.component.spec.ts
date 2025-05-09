import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VisNodeLink2Component } from './vis-node-link-2.component';

describe('VisNodeLink2Component', () => {
  let component: VisNodeLink2Component;
  let fixture: ComponentFixture<VisNodeLink2Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VisNodeLink2Component]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VisNodeLink2Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
