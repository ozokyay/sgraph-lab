import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TabConnectionsComponent } from './tab-connections.component';

describe('TabConnectionsComponent', () => {
  let component: TabConnectionsComponent;
  let fixture: ComponentFixture<TabConnectionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabConnectionsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TabConnectionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
