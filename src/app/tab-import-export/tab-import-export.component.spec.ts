import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TabImportExportComponent } from './tab-import-export.component';

describe('TabImportExportComponent', () => {
  let component: TabImportExportComponent;
  let fixture: ComponentFixture<TabImportExportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabImportExportComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TabImportExportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
