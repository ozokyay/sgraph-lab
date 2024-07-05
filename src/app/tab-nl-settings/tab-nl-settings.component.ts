import { Component } from '@angular/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';

@Component({
  selector: 'app-tab-nl-settings',
  standalone: true,
  imports: [
    MatSliderModule,
    MatSlideToggleModule
  ],
  templateUrl: './tab-nl-settings.component.html',
  styleUrl: './tab-nl-settings.component.css'
})
export class TabNlSettingsComponent {


  public onChangeLayout() {

  }

  public onChangeGraphics() {

  }
}
