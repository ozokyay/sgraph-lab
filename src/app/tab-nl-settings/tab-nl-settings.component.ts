import { Component } from '@angular/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { ConfigurationService } from '../configuration.service';
import { DefaultGraphics, DefaultLayout, GraphicsSettings, LayoutSettings } from '../nl-settings';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-tab-nl-settings',
  standalone: true,
  imports: [
    MatSliderModule,
    MatSlideToggleModule,
    MatButtonModule,
    FormsModule
  ],
  templateUrl: './tab-nl-settings.component.html',
  styleUrl: './tab-nl-settings.component.css'
})
export class TabNlSettingsComponent {

  public layoutSettings: LayoutSettings = structuredClone(DefaultLayout);

  constructor(private config: ConfigurationService) {}

  public onChangeLayout() {
    this.config.layoutSettings.next(this.layoutSettings);
  }
}
