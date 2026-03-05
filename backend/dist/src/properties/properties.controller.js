"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PropertiesController = void 0;
const common_1 = require("@nestjs/common");
const properties_service_1 = require("./properties.service");
let PropertiesController = class PropertiesController {
    constructor(propertiesService) {
        this.propertiesService = propertiesService;
    }
    async getProperties() {
        return this.propertiesService.findAll();
    }
    async getNearbyProperties(lat, lng, radius = 5000) {
        return this.propertiesService.findNearby(Number(lat), Number(lng), Number(radius));
    }
    async getProperty(id) {
        return this.propertiesService.findById(id);
    }
};
exports.PropertiesController = PropertiesController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PropertiesController.prototype, "getProperties", null);
__decorate([
    (0, common_1.Get)('nearby'),
    __param(0, (0, common_1.Query)('lat')),
    __param(1, (0, common_1.Query)('lng')),
    __param(2, (0, common_1.Query)('radius')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, Number]),
    __metadata("design:returntype", Promise)
], PropertiesController.prototype, "getNearbyProperties", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PropertiesController.prototype, "getProperty", null);
exports.PropertiesController = PropertiesController = __decorate([
    (0, common_1.Controller)('api/v1/properties'),
    __metadata("design:paramtypes", [properties_service_1.PropertiesService])
], PropertiesController);
//# sourceMappingURL=properties.controller.js.map