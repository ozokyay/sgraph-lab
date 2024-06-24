import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TabClusterListComponent } from './tab-cluster-list.component';

describe('TabClusterListComponent', () => {
  let component: TabClusterListComponent;
  let fixture: ComponentFixture<TabClusterListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabClusterListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TabClusterListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
