// /api — Menu management: categories, items, option groups/options, extras, tags, social links, image upload.
// Fixed paths are listed before their :param siblings.
import { Router } from 'express';
import { defineRoute } from './defineRoute.js';
import { listCategories, createCategory, updateCategory, deleteCategory } from '../controllers/catalog/categories.controller.js';
import { listMenuItems, createMenuItem, getMenuItem, updateMenuItem, deleteMenuItem } from '../controllers/catalog/menuItems.controller.js';
import { listOptionGroups, createOptionGroup, updateOptionGroup, deleteOptionGroup } from '../controllers/catalog/optionGroups.controller.js';
import { createItemOption, updateItemOption, deleteItemOption } from '../controllers/catalog/itemOptions.controller.js';
import { listItemExtras, createItemExtra, updateItemExtra, deleteItemExtra } from '../controllers/catalog/itemExtras.controller.js';
import { listTags, createTag, updateTag, deleteTag } from '../controllers/catalog/tags.controller.js';
import { listSocialLinks, createSocialLink, updateSocialLink, deleteSocialLink } from '../controllers/catalog/socialLinks.controller.js';
import { uploadImage } from '../controllers/upload.controller.js';

const router = Router();

defineRoute(router, '/categories', { GET: listCategories, POST: createCategory });
defineRoute(router, '/categories/:id', { PUT: updateCategory, DELETE: deleteCategory });
defineRoute(router, '/menu-items', { GET: listMenuItems, POST: createMenuItem });
defineRoute(router, '/menu-items/:id', { GET: getMenuItem, PUT: updateMenuItem, DELETE: deleteMenuItem });
defineRoute(router, '/option-groups', { GET: listOptionGroups, POST: createOptionGroup });
defineRoute(router, '/option-groups/:id', { PUT: updateOptionGroup, DELETE: deleteOptionGroup });
defineRoute(router, '/item-options', { POST: createItemOption });
defineRoute(router, '/item-options/:id', { PUT: updateItemOption, DELETE: deleteItemOption });
defineRoute(router, '/item-extras', { GET: listItemExtras, POST: createItemExtra });
defineRoute(router, '/item-extras/:id', { PUT: updateItemExtra, DELETE: deleteItemExtra });
defineRoute(router, '/tags', { GET: listTags, POST: createTag });
defineRoute(router, '/tags/:id', { PUT: updateTag, DELETE: deleteTag });
defineRoute(router, '/social-links', { GET: listSocialLinks, POST: createSocialLink });
defineRoute(router, '/social-links/:id', { PUT: updateSocialLink, DELETE: deleteSocialLink });
defineRoute(router, '/upload', { POST: uploadImage });

export default router;
