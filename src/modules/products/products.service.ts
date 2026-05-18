import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AddProductImagesDto } from './dto/add-product-images.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const PRODUCT_IMAGE_UPLOAD_DIR = 'product-images';
const PRODUCT_IMAGE_MAX_SIZE = 10 * 1024 * 1024;
const PRODUCT_IMAGE_MIME_EXTENSIONS = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/heic', '.heic'],
  ['image/heif', '.heif'],
]);

type UploadedProductImageFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

type UploadProductImageInput = {
  file: UploadedProductImageFile;
  altText?: string;
  publicBaseUrl?: string;
};

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProductDto, actor?: AuthenticatedUser) {
    const companyId = await this.resolveWriteCompanyId(actor, dto.companyId);
    const data = this.cleanProductData(dto);

    return this.prisma.product.create({
      data: {
        ...data,
        companyId,
      } as Prisma.ProductUncheckedCreateInput,
      include: this.productInclude(),
    });
  }

  async findAll(query: ProductQueryDto, actor?: AuthenticatedUser) {
    const companyId = this.resolveReadCompanyId(actor, query.companyId);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const where: Prisma.ProductWhereInput = {
      ...(companyId ? { companyId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.category?.trim()
        ? { category: { contains: query.category.trim(), mode: 'insensitive' } }
        : {}),
      ...(query.search?.trim()
        ? {
            OR: [
              { name: { contains: query.search.trim(), mode: 'insensitive' } },
              {
                description: {
                  contains: query.search.trim(),
                  mode: 'insensitive',
                },
              },
              { category: { contains: query.search.trim(), mode: 'insensitive' } },
              { keywords: { hasSome: this.cleanKeywords([query.search]) } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: this.productInclude(),
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string, actor?: AuthenticatedUser) {
    const product = await this.findScopedProduct(id, actor);
    return product;
  }

  async update(id: string, dto: UpdateProductDto, actor?: AuthenticatedUser) {
    const product = await this.findScopedProduct(id, actor);
    this.assertCompanyIdIsNotChanged(dto.companyId, product.companyId, actor);
    const data = this.cleanProductData(dto);

    return this.prisma.product.update({
      where: { id: product.id },
      data: data as Prisma.ProductUncheckedUpdateInput,
      include: this.productInclude(),
    });
  }

  async deactivate(id: string, actor?: AuthenticatedUser) {
    const product = await this.findScopedProduct(id, actor);

    return this.prisma.product.update({
      where: { id: product.id },
      data: {
        status: 'INACTIVE',
        isAvailable: false,
      },
      include: this.productInclude(),
    });
  }

  async addImages(
    productId: string,
    dto: AddProductImagesDto,
    actor?: AuthenticatedUser,
  ) {
    const product = await this.findScopedProduct(productId, actor);
    const images = (dto.images ?? [])
      .map((image) => ({
        imageUrl: image.imageUrl?.trim(),
        altText: image.altText?.trim() || null,
        metadata:
          image.metadata === undefined
            ? undefined
            : this.toJson(image.metadata),
      }))
      .filter((image) => Boolean(image.imageUrl));

    if (images.length === 0) {
      throw new BadRequestException('At least one imageUrl is required');
    }

    await this.prisma.productImage.createMany({
      data: images.map((image) => ({
        productId: product.id,
        imageUrl: image.imageUrl,
        altText: image.altText,
        metadata: image.metadata,
      })),
    });

    return this.prisma.product.findUnique({
      where: { id: product.id },
      include: this.productInclude(),
    });
  }

  async uploadImage(
    productId: string,
    input: UploadProductImageInput,
    actor?: AuthenticatedUser,
  ) {
    const product = await this.findScopedProduct(productId, actor);
    const { file } = input;

    this.assertValidImageFile(file);

    const safeCompanyId = this.safePathSegment(product.companyId);
    const safeProductId = this.safePathSegment(product.id);
    const extension = this.resolveImageExtension(file);
    const filename = `${Date.now()}-${randomUUID()}${extension}`;
    const key = [
      PRODUCT_IMAGE_UPLOAD_DIR,
      safeCompanyId,
      safeProductId,
      filename,
    ].join('/');
    const uploadsRoot = this.uploadsRoot();
    const targetDir = resolve(
      uploadsRoot,
      PRODUCT_IMAGE_UPLOAD_DIR,
      safeCompanyId,
      safeProductId,
    );
    const targetPath = resolve(targetDir, filename);

    this.assertPathIsInsideRoot(uploadsRoot, targetPath);

    await mkdir(targetDir, { recursive: true });
    await writeFile(targetPath, file.buffer);

    await this.prisma.productImage.create({
      data: {
        productId: product.id,
        imageUrl: this.buildUploadUrl(key, input.publicBaseUrl),
        altText: input.altText?.trim() || null,
        metadata: this.toJson({
          storage: 'local',
          key,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
        }),
      },
    });

    return this.prisma.product.findUnique({
      where: { id: product.id },
      include: this.productInclude(),
    });
  }

  async deleteImage(
    productId: string,
    imageId: string,
    actor?: AuthenticatedUser,
  ) {
    const product = await this.findScopedProduct(productId, actor);
    const image = await this.prisma.productImage.findFirst({
      where: {
        id: imageId,
        productId: product.id,
      },
      select: { id: true, metadata: true },
    });

    if (!image) {
      throw new NotFoundException('Product image not found');
    }

    await this.prisma.productImage.delete({
      where: { id: image.id },
    });

    await this.deleteLocalImageFile(image.metadata);

    return {
      deleted: true,
      productId: product.id,
      imageId: image.id,
    };
  }

  private async resolveWriteCompanyId(
    actor?: AuthenticatedUser,
    requestedCompanyId?: string | null,
  ) {
    if (!actor) {
      throw new ForbiddenException('Authentication is required');
    }

    if (actor.role === UserRole.SUPER_ADMIN) {
      const companyId = requestedCompanyId?.trim();
      if (!companyId) {
        throw new BadRequestException('companyId is required for super admin');
      }

      await this.ensureCompanyExists(companyId);
      return companyId;
    }

    if (!actor.companyId) {
      throw new ForbiddenException('User is not linked to a company');
    }

    if (
      requestedCompanyId?.trim() &&
      requestedCompanyId.trim() !== actor.companyId
    ) {
      throw new ForbiddenException(
        'companyId is resolved from the authenticated user',
      );
    }

    return actor.companyId;
  }

  private resolveReadCompanyId(
    actor?: AuthenticatedUser,
    requestedCompanyId?: string | null,
  ) {
    if (!actor) {
      throw new ForbiddenException('Authentication is required');
    }

    if (actor.role === UserRole.SUPER_ADMIN) {
      return requestedCompanyId?.trim() || undefined;
    }

    if (!actor.companyId) {
      throw new ForbiddenException('User is not linked to a company');
    }

    if (
      requestedCompanyId?.trim() &&
      requestedCompanyId.trim() !== actor.companyId
    ) {
      throw new ForbiddenException(
        'companyId is resolved from the authenticated user',
      );
    }

    return actor.companyId;
  }

  private async findScopedProduct(id: string, actor?: AuthenticatedUser) {
    const companyId = this.resolveReadCompanyId(actor);
    const product = await this.prisma.product.findFirst({
      where: {
        id,
        ...(companyId ? { companyId } : {}),
      },
      include: this.productInclude(),
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  private assertCompanyIdIsNotChanged(
    requestedCompanyId: string | undefined,
    currentCompanyId: string,
    actor?: AuthenticatedUser,
  ) {
    if (!requestedCompanyId?.trim()) {
      return;
    }

    if (actor?.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'companyId is resolved from the authenticated user',
      );
    }

    if (requestedCompanyId.trim() !== currentCompanyId) {
      throw new BadRequestException('Product companyId cannot be changed');
    }
  }

  private cleanProductData(dto: Partial<CreateProductDto>): Prisma.ProductUpdateInput {
    const data: Prisma.ProductUpdateInput = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException('Product name is required');
      }
      data.name = name;
    }

    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
    }

    if (dto.category !== undefined) {
      data.category = dto.category?.trim() || null;
    }

    if (dto.price !== undefined) {
      data.price = dto.price === null ? null : dto.price;
    }

    if (dto.currency !== undefined) {
      data.currency = dto.currency?.trim() || 'TND';
    }

    if (dto.isAvailable !== undefined) {
      data.isAvailable = dto.isAvailable;
    }

    if (dto.status !== undefined) {
      data.status = dto.status;
    }

    if (dto.keywords !== undefined) {
      data.keywords = this.cleanKeywords(dto.keywords);
    }

    if (dto.variants !== undefined) {
      data.variants = this.toJson(dto.variants);
    }

    if (dto.metadata !== undefined) {
      data.metadata = this.toJson(dto.metadata);
    }

    return data;
  }

  private cleanKeywords(values?: string[]): string[] {
    return Array.from(
      new Set(
        (values ?? [])
          .flatMap((value) => value.split(/[,\s]+/))
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean),
      ),
    );
  }

  private toJson(
    value: Record<string, unknown> | null | undefined,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === null || value === undefined) {
      return Prisma.JsonNull;
    }

    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private assertValidImageFile(file: UploadedProductImageFile) {
    if (!file.buffer?.length) {
      throw new BadRequestException('Image file is empty');
    }

    if (file.size > PRODUCT_IMAGE_MAX_SIZE) {
      throw new BadRequestException('Image file exceeds 10 MB');
    }

    if (!PRODUCT_IMAGE_MIME_EXTENSIONS.has(file.mimetype)) {
      throw new BadRequestException(
        'Only JPG, PNG, WEBP, GIF, HEIC and HEIF images are allowed',
      );
    }
  }

  private resolveImageExtension(file: UploadedProductImageFile) {
    const allowedExtensions = new Set(PRODUCT_IMAGE_MIME_EXTENSIONS.values());
    const originalExtension = extname(file.originalname).toLowerCase();

    if (allowedExtensions.has(originalExtension)) {
      return originalExtension;
    }

    return PRODUCT_IMAGE_MIME_EXTENSIONS.get(file.mimetype) ?? '.jpg';
  }

  private buildUploadUrl(key: string, publicBaseUrl?: string) {
    const encodedKey = key
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
    const baseUrl =
      publicBaseUrl?.replace(/\/+$/, '') ||
      process.env.BACKEND_PUBLIC_URL?.replace(/\/+$/, '') ||
      `http://localhost:${process.env.PORT || '3001'}`;

    return `${baseUrl}/uploads/${encodedKey}`;
  }

  private async deleteLocalImageFile(metadata: unknown) {
    if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') {
      return;
    }

    const value = metadata as Record<string, unknown>;
    if (value.storage !== 'local' || typeof value.key !== 'string') {
      return;
    }

    const uploadsRoot = this.uploadsRoot();
    const targetPath = resolve(uploadsRoot, value.key);
    this.assertPathIsInsideRoot(uploadsRoot, targetPath);

    try {
      await unlink(targetPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private uploadsRoot() {
    return resolve(process.cwd(), 'uploads');
  }

  private safePathSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  private assertPathIsInsideRoot(root: string, targetPath: string) {
    const normalizedRoot = root.endsWith(sep) ? root : `${root}${sep}`;

    if (targetPath !== root && !targetPath.startsWith(normalizedRoot)) {
      throw new BadRequestException('Invalid upload path');
    }
  }

  private async ensureCompanyExists(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }
  }

  private productInclude() {
    return {
      images: {
        orderBy: { createdAt: 'asc' as const },
      },
    };
  }
}
