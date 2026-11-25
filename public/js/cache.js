// Textures shared by several models (hair, skin) are fetched once instead of once per model.
import { Cache } from 'three';
Cache.enabled = true;
