import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TabNlSettingsComponent } from './tab-nl-settings.component';

describe('TabNlSettingsComponent', () => {
  let component: TabNlSettingsComponent;
  let fixture: ComponentFixture<TabNlSettingsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabNlSettingsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TabNlSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
