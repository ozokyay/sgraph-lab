import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TabClusterComponent } from './tab-cluster.component';

describe('TabClusterComponent', () => {
  let component: TabClusterComponent;
  let fixture: ComponentFixture<TabClusterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabClusterComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TabClusterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
