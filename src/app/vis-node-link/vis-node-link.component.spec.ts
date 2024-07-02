import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VisNodeLinkComponent } from './vis-node-link.component';

describe('VisNodeLinkComponent', () => {
  let component: VisNodeLinkComponent;
  let fixture: ComponentFixture<VisNodeLinkComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VisNodeLinkComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VisNodeLinkComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
