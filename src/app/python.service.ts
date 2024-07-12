import * as py from 'pyodide';
import * as d3 from 'd3';
import { Injectable } from '@angular/core';
import { EdgeList } from './graph';
import { EmptySeries, Series } from './series';
import { Point } from './point';

@Injectable({
  providedIn: 'root'
})
export class PythonService {

  private worker!: Worker
  private id: number = 0;
  private promises: Map<number, (value: any) => void> = new Map();

  constructor() {}

  public async initPython() {
    if (typeof Worker !== 'undefined') {
      this.worker = new Worker(new URL('./python.worker', import.meta.url), { type: "classic" });
      this.worker.onmessage = ({ data }) => {
        const response = data as PythonResponse;
        const promise = this.promises.get(response.id);
        this.promises.delete(response.id);
        if (promise == undefined) {
          console.log("Promise not found");
          return;
        }
        promise(response.value);
      };
      await this.call("init");
    } else {
      alert("Please use a web browser that supports web workers");
    }
  }

  private async call(method: PythonMethod, param?: any): Promise<any> {
    const request: PythonRequest = {
      id: this.id++,
      method: method,
      param: param
    }
    const promise = new Promise(resolve => {
      this.promises.set(request.id, resolve);
    });
    this.worker.postMessage(request);
    return promise;
  }

  public async generateChungLu(degrees: number[]): Promise<EdgeList> {
    return await this.call("generateChungLu", degrees);
  }

  public async generateConfiguration(degrees: number[]): Promise<EdgeList> {
    return await this.call("generateConfiguration", degrees);
  }

  public async setGraph(input: EdgeList): Promise<void> {
    return await this.call("setGraph", input);
  }

  public async getSimpleMeasure(measure: "degree_assortativity_coefficient" | "degree_pearson_assortativity_coefficient"): Promise<number> {
    return await this.call("getSimpleMeasure", measure);
  }

  public async getGraphMeasure(measure: "clustering" | "pagerank" | "eigenvector_centrality" | "betweenness_centrality", bins: number): Promise<Series> {
    return await this.call("getGraphMeasure", measure);
  }

  public async getClusteringCoefficientDistribution2(): Promise<Series> {
    return await this.call("getClusteringCoefficientDistribution2");
  }

  public async getDiameter(): Promise<number> {
    return await this.call("getDiameter");
  }
}

export type PythonMethod = "init"
  | "abort"
  | "generateChungLu"
  | "generateConfiguration"
  | "setGraph"
  | "getSimpleMeasure"
  | "getGraphMeasure"
  | "getClusteringCoefficientDistribution2"
  | "getDiameter";

export interface PythonRequest {
  id: number,
  method: PythonMethod,
  param?: any
}

export interface PythonResponse {
  id: number
  value: any
}