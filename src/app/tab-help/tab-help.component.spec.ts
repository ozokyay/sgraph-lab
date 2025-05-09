import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TabHelpComponent } from './tab-help.component';

describe('TabHelpComponent', () => {
  let component: TabHelpComponent;
  let fixture: ComponentFixture<TabHelpComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabHelpComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TabHelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
