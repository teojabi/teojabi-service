import { PropertiesService } from './properties.service';
export declare class PropertiesController {
    private readonly propertiesService;
    constructor(propertiesService: PropertiesService);
    getProperties(): Promise<unknown>;
    getNearbyProperties(lat: number, lng: number, radius?: number): Promise<unknown>;
    getProperty(id: string): Promise<any>;
    createProperty(body: any): Promise<any>;
}
