import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { AddProductImagesDto } from './dto/add-product-images.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  create(
    @Body() createProductDto: CreateProductDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.productsService.create(createProductDto, actor);
  }

  @Get()
  findAll(
    @Query() query: ProductQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.productsService.findAll(query, actor);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.productsService.findOne(id, actor);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.productsService.update(id, updateProductDto, actor);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.productsService.deactivate(id, actor);
  }

  @Post(':id/images')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  addImages(
    @Param('id') id: string,
    @Body() addProductImagesDto: AddProductImagesDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.productsService.addImages(id, addProductImagesDto, actor);
  }

  @Post(':id/images/upload')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  uploadImage(
    @Param('id') id: string,
    @UploadedFile()
    file:
      | {
          buffer: Buffer;
          originalname: string;
          mimetype: string;
          size: number;
        }
      | undefined,
    @Body('altText') altText: string | undefined,
    @Req() request: Request,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException('A file is required');
    }

    return this.productsService.uploadImage(
      id,
      {
        file,
        altText,
        publicBaseUrl: this.resolvePublicBaseUrl(request),
      },
      actor,
    );
  }

  @Delete(':id/images/:imageId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  deleteImage(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.productsService.deleteImage(id, imageId, actor);
  }

  private resolvePublicBaseUrl(request: Request) {
    const forwardedProto = request.header('x-forwarded-proto')?.split(',')[0]?.trim();
    const forwardedHost = request.header('x-forwarded-host')?.split(',')[0]?.trim();
    const protocol = forwardedProto || request.protocol;
    const host = forwardedHost || request.get('host');

    if (!host) {
      return undefined;
    }

    return `${protocol}://${host}`;
  }
}
