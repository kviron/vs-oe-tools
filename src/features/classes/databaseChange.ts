import { closeClassDetailPanels } from './views/classDetailsPanelManager';
import { closeAttributeDetailPanels } from './views/attributeDetailsPanelManager';
import { closePropertyDetailPanels } from './views/propertyDetailsPanelManager';
import { closeEntityPropertiesPanels } from './views/entityPropertiesPanelManager';
import { closeClassObjectPanels } from './views/classObjectsPanelManager';
import { closeObjectViewPanels } from './views/objectViewPanelManager';

/** Invalidates all class-domain panels when their database changes. */
export function onClassesDatabaseChanged(): void {
	closeClassDetailPanels();
	closeAttributeDetailPanels();
	closePropertyDetailPanels();
	closeEntityPropertiesPanels();
	closeClassObjectPanels();
	closeObjectViewPanels();
}
