import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TabInformationDiffusionComponent } from './tab-information-diffusion.component';

describe('TabInformationDiffusionComponent', () => {
  let component: TabInformationDiffusionComponent;
  let fixture: ComponentFixture<TabInformationDiffusionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabInformationDiffusionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TabInformationDiffusionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
