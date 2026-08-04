import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'atlas:isPublic';
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
