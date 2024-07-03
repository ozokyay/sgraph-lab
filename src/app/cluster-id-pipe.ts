      
import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'clusterid',
    standalone: true,
})
export class ClusterIDPipe implements PipeTransform {
    transform(value: string): string {
        const entries = value.trim().split(", ");
        const letters: string[] = [];
        for (const str of entries) {
            const num = parseInt(str);
            letters.push(this.numberToLetters(num + 1));
        }
        return letters.join(", ");
    }

    private numberToLetters(value: number): string {
        let letters: string = "";
        while (value > 0) {
            const modulo: number = (value - 1) % 26;
            letters = String.fromCharCode(65 + modulo) + letters;
            value = Math.floor((value - modulo) / 26);
        }
        return letters;
    }
}

