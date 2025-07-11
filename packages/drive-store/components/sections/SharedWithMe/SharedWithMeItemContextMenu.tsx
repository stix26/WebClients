import { ContextSeparator, useConfirmActionModal } from '@proton/components';
import { isPreviewAvailable } from '@proton/shared/lib/helpers/preview';

import { useSharedWithMeActions } from '../../../store';
import { useOpenInDocs } from '../../../store/_documents';
import type { ContextMenuProps } from '../../FileBrowser';
import { useDetailsModal } from '../../modals/DetailsModal';
import { useFilesDetailsModal } from '../../modals/FilesDetailsModal';
import { DetailsButton, DownloadButton, OpenInDocsButton, PreviewButton } from '../ContextMenu';
import { ItemContextMenu } from '../ContextMenu/ItemContextMenu';
import { AcceptButton } from './ContextMenuButtons/AcceptButton';
import { DeclineButton } from './ContextMenuButtons/DeclineButton';
import { OpenBookmarkButton } from './ContextMenuButtons/OpenBookmarkButton';
import { RemoveBookmarkButton } from './ContextMenuButtons/RemoveBookmarkButton';
import { RemoveMeButton } from './ContextMenuButtons/RemoveMeButton';
import type { SharedWithMeItem } from './SharedWithMe';

export function SharedWithMeContextMenu({
    selectedBrowserItems,
    anchorRef,
    isOpen,
    position,
    open,
    close,
}: ContextMenuProps & {
    selectedBrowserItems: SharedWithMeItem[];
}) {
    const selectedBrowserItem = selectedBrowserItems.at(0);
    const isOnlyOneItem = selectedBrowserItems.length === 1 && !!selectedBrowserItem;
    const isOnlyOneFileItem = isOnlyOneItem && selectedBrowserItem.isFile;
    const hasPreviewAvailable =
        isOnlyOneItem &&
        selectedBrowserItem.isFile &&
        selectedBrowserItem.mimeType &&
        isPreviewAvailable(selectedBrowserItem.mimeType, selectedBrowserItem.size);

    const [detailsModal, showDetailsModal] = useDetailsModal();
    const [filesDetailsModal, showFilesDetailsModal] = useFilesDetailsModal();
    const openInDocs = useOpenInDocs(selectedBrowserItem);
    const { removeMe } = useSharedWithMeActions();
    const [confirmModal, showConfirmModal] = useConfirmActionModal();

    const hasAlbumSelected = selectedBrowserItems.some((item) => !!item.albumProperties);

    return (
        <>
            <ItemContextMenu isOpen={isOpen} open={open} close={close} position={position} anchorRef={anchorRef}>
                {selectedBrowserItem && !selectedBrowserItem.isInvitation && !selectedBrowserItem.isBookmark && (
                    <>
                        {hasPreviewAvailable && (
                            <PreviewButton
                                shareId={selectedBrowserItem.rootShareId}
                                linkId={selectedBrowserItem.linkId}
                                close={close}
                            />
                        )}
                        {isOnlyOneFileItem && openInDocs.canOpen && <OpenInDocsButton {...openInDocs} close={close} />}
                        {!hasAlbumSelected && (
                            <DownloadButton selectedBrowserItems={selectedBrowserItems} close={close} />
                        )}
                        <DetailsButton
                            selectedBrowserItems={selectedBrowserItems}
                            showDetailsModal={showDetailsModal}
                            showFilesDetailsModal={showFilesDetailsModal}
                            close={close}
                        />
                        {!!selectedBrowserItem && isOnlyOneItem && (
                            <>
                                <ContextSeparator />
                                <RemoveMeButton
                                    rootShareId={selectedBrowserItem.rootShareId}
                                    removeMe={removeMe}
                                    showConfirmModal={showConfirmModal}
                                    close={close}
                                />
                            </>
                        )}
                    </>
                )}
                {selectedBrowserItem?.isBookmark && selectedBrowserItem.bookmarkDetails && (
                    <>
                        <OpenBookmarkButton
                            token={selectedBrowserItem.bookmarkDetails.token}
                            urlPassword={selectedBrowserItem.bookmarkDetails.urlPassword}
                            close={close}
                        />
                        <RemoveBookmarkButton
                            token={selectedBrowserItem.bookmarkDetails.token}
                            linkId={selectedBrowserItem.linkId}
                            showConfirmModal={showConfirmModal}
                            close={close}
                        />
                    </>
                )}
                {selectedBrowserItem?.invitationDetails && (
                    <>
                        <AcceptButton
                            invitationId={selectedBrowserItem.invitationDetails.invitation.invitationId}
                            close={close}
                        />
                        <DeclineButton
                            invitationId={selectedBrowserItem.invitationDetails.invitation.invitationId}
                            showConfirmModal={showConfirmModal}
                            close={close}
                        />
                    </>
                )}
            </ItemContextMenu>
            {detailsModal}
            {filesDetailsModal}
            {confirmModal}
        </>
    );
}
