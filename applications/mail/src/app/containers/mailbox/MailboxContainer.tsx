import type { RefObject } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';

import { c } from 'ttag';

import type { CommanderItemInterface } from '@proton/components';
import {
    Commander,
    DrawerSidebar,
    DrawerVisibilityButton,
    ErrorBoundary,
    InboxQuickSettingsAppButton,
    PrivateMainArea,
    useActiveBreakpoint,
    useItemsSelection,
    useModalState,
} from '@proton/components';
import { useFolders, useLabels } from '@proton/mail';
import { MESSAGE_ACTIONS } from '@proton/mail-renderer/constants';
import { getFolderName } from '@proton/mail/store/labels/helpers';
import { MAILBOX_LABEL_IDS } from '@proton/shared/lib/constants';
import { hasBit } from '@proton/shared/lib/helpers/bitset';
import { getSearchParams } from '@proton/shared/lib/helpers/url';
import type { MailSettings, UserSettings } from '@proton/shared/lib/interfaces';
import type { Message } from '@proton/shared/lib/interfaces/mail/Message';
import { LABEL_IDS_TO_HUMAN, MARK_AS_STATUS } from '@proton/shared/lib/mail/constants';
import { MAIL_PAGE_SIZE, SHOW_MOVED, VIEW_MODE } from '@proton/shared/lib/mail/mailSettings';
import { isDraft } from '@proton/shared/lib/mail/messages';
import type { Filter, SearchParameters, Sort } from '@proton/shared/lib/mail/search';
import clsx from '@proton/utils/clsx';

import { useCheckAllRef } from 'proton-mail/containers/CheckAllRefProvider';
import useMailDrawer from 'proton-mail/hooks/drawer/useMailDrawer';
import { useSelectAll } from 'proton-mail/hooks/useSelectAll';
import { useMailECRTMetric } from 'proton-mail/metrics/useMailECRTMetric';
import { useMailboxContainerSideEffects } from 'proton-mail/router/sideEffects/useMailboxContainerSideEffects';
import { useMailSelector } from 'proton-mail/store/hooks';

import ConversationView from '../../components/conversation/ConversationView';
import MailHeader from '../../components/header/MailHeader';
import List from '../../components/list/List';
import type { SOURCE_ACTION } from '../../components/list/useListTelemetry';
import useScrollToTop from '../../components/list/useScrollToTop';
import MessageOnlyView from '../../components/message/MessageOnlyView';
import { useLabelActionsContext } from '../../components/sidebar/EditLabelContext';
import Toolbar from '../../components/toolbar/Toolbar';
import { isMessage, isSearch as testIsSearch } from '../../helpers/elements';
import { isColumnMode, isConversationMode } from '../../helpers/mailSettings';
import {
    extractSearchParameters,
    filterFromUrl,
    pageFromUrl,
    setFilterInUrl,
    setPageInUrl,
    setParamsInLocation,
    setSortInUrl,
    sortFromUrl,
} from '../../helpers/mailboxUrl';
import { usePermanentDelete } from '../../hooks/actions/delete/usePermanentDelete';
import { useMarkAs } from '../../hooks/actions/markAs/useMarkAs';
import { ComposeTypes } from '../../hooks/composer/useCompose';
import { useElements, useGetElementsFromIDs } from '../../hooks/mailbox/useElements';
import { useMailboxFocus } from '../../hooks/mailbox/useMailboxFocus';
import { useMailboxHotkeys } from '../../hooks/mailbox/useMailboxHotkeys';
import { useWelcomeFlag } from '../../hooks/mailbox/useWelcomeFlag';
import { useDeepMemo } from '../../hooks/useDeepMemo';
import { useResizeMessageView } from '../../hooks/useResizeMessageView';
import { selectComposersCount } from '../../store/composers/composerSelectors';
import { useOnCompose } from '../ComposeProvider';
import MailboxContainerPlaceholder from './MailboxContainerPlaceholder';
import { MailboxContainerContextProvider } from './MailboxContainerProvider';

interface Props {
    labelID: string;
    mailSettings: MailSettings;
    userSettings: UserSettings;
    elementID?: string;
    messageID?: string;
}

const MailboxContainer = ({ labelID: inputLabelID, mailSettings, userSettings, elementID, messageID }: Props) => {
    const location = useLocation();
    const history = useHistory();
    const [labels] = useLabels();
    const [folders] = useFolders();
    const { createLabel } = useLabelActionsContext();
    const getElementsFromIDs = useGetElementsFromIDs();
    const { markAs, selectAllMarkModal } = useMarkAs();
    const listRef = useRef<HTMLDivElement>(null);
    const listContainerRef = useRef<HTMLDivElement>(null);
    const breakpoints = useActiveBreakpoint();
    const forceRowMode =
        breakpoints.viewportWidth['<=small'] || breakpoints.viewportWidth.medium || breakpoints.viewportWidth.large;
    const columnModeSetting = isColumnMode(mailSettings);
    const columnMode = columnModeSetting && !forceRowMode;
    const columnLayout = columnModeSetting || forceRowMode;
    const labelIDs = (labels || []).map(({ ID }) => ID);
    const messageContainerRef = useRef<HTMLElement>(null);
    const mainAreaRef = useRef<HTMLDivElement>(null);
    const resizeAreaRef = useRef<HTMLButtonElement>(null);
    const composersCount = useMailSelector(selectComposersCount);
    const isComposerOpened = composersCount > 0;
    const { drawerSidebarButtons, showDrawerSidebar } = useMailDrawer();
    const { selectAll, setSelectAll } = useSelectAll({ labelID: inputLabelID });
    const { setCheckAllRef } = useCheckAllRef();

    const labelDropdownToggleRef = useRef<() => void>(() => {});
    const moveDropdownToggleRef = useRef<() => void>(() => {});

    const { enableResize, resetWidth, scrollBarWidth, isResizing } = useResizeMessageView(
        mainAreaRef,
        resizeAreaRef,
        listContainerRef
    );

    const page = pageFromUrl(location);
    const searchParams = getSearchParams(location.hash);
    const isConversationContentView = mailSettings.ViewMode === VIEW_MODE.GROUP;
    const searchParameters = useDeepMemo<SearchParameters>(() => extractSearchParameters(location), [location]);
    const isSearch = testIsSearch(searchParameters);
    const sort = useMemo<Sort>(() => sortFromUrl(location, inputLabelID), [searchParams.sort, inputLabelID]);
    const filter = useMemo<Filter>(() => filterFromUrl(location), [searchParams.filter]);

    const navigateTo = (labelID: MAILBOX_LABEL_IDS) => {
        history.push(`/${LABEL_IDS_TO_HUMAN[labelID]}`);
    };

    const handlePage = useCallback(
        (pageNumber: number) => {
            history.push(setPageInUrl(history.location, pageNumber));
        },
        [history]
    );

    const [isMessageOpening, setIsMessageOpening] = useState(false);

    const onMessageLoad = useCallback(() => setIsMessageOpening(true), []);
    const onMessageReady = useCallback(() => setIsMessageOpening(false), [setIsMessageOpening]);

    const pageSize = mailSettings?.PageSize || MAIL_PAGE_SIZE.FIFTY;

    const elementsParams = {
        conversationMode: isConversationMode(inputLabelID, mailSettings, location),
        labelID: inputLabelID,
        page: pageFromUrl(location),
        pageSize,
        sort,
        filter,
        search: searchParameters,
        onPage: handlePage,
        mailSettings,
    };

    const { labelID, elements, elementIDs, loading, placeholderCount, total } = useElements(elementsParams);

    const { handleDelete: permanentDelete, deleteSelectionModal, deleteAllModal } = usePermanentDelete(labelID);

    const handleBack = useCallback(
        () => history.push(setParamsInLocation(history.location, { labelID })),
        [history, labelID]
    );

    const { startECRTMetric } = useMailECRTMetric();

    const onCompose = useOnCompose();

    const onCheck = (checked: boolean) => {
        // Reset select all state when interacting with checkboxes in the list
        if (selectAll && !checked) {
            setSelectAll(false);
        }
    };

    const conversationMode = isConversationMode(labelID, mailSettings, location);

    const {
        checkedIDs,
        selectedIDs,
        handleCheck,
        handleCheckAll,
        handleCheckOne,
        handleCheckOnlyOne,
        handleCheckRange,
    } = useItemsSelection({
        conversationMode,
        activeID: elementID,
        allIDs: elementIDs,
        rowMode: !columnMode,
        messageID,
        // Using inputLabelID, page, filter, sort, and searchParameters as dependency to reset checkedIDs on any list-changing parameter
        resetDependencies: [columnMode ? elementID : undefined, inputLabelID, page, filter, sort, searchParameters],
        onCheck,
    });

    const elementsLength = loading ? placeholderCount : elements.length;
    const showList = columnMode || !elementID;
    const showContentPanel = (columnMode && !!elementsLength) || !!elementID;
    const showPlaceholder =
        !breakpoints.viewportWidth['<=small'] && (!elementID || (!!checkedIDs.length && columnMode));
    const showContentView = showContentPanel && !!elementID;
    const [commanderModalProps, showCommander, commanderRender] = useModalState();
    const { focusID, setFocusID, focusLastID, focusFirstID, focusNextID, focusPreviousID } = useMailboxFocus({
        elementIDs,
        page,
        filter,
        sort,
        showList,
        listRef,
        labelID,
        isComposerOpened,
        loading,
    });

    const handleFocus = useCallback(
        (elementID: string) => {
            setFocusID(elementID);
        },
        [setFocusID]
    );

    const handleSort = useCallback(
        (sort: Sort) => {
            // Reset selections when sort changes
            setSelectAll(false);
            handleCheckAll(false);

            // Then update the URL
            history.push(setSortInUrl(history.location, sort));
        },
        [history]
    );

    const handleFilter = useCallback(
        (filter: Filter) => {
            // Reset selections when filter changes
            setSelectAll(false);
            handleCheckAll(false);

            // Then update the URL
            history.push(setFilterInUrl(history.location, filter));
        },
        [history]
    );

    const welcomeFlag = useWelcomeFlag([labelID, selectedIDs.length]);

    const handleElement = useCallback(
        (elementID: string | undefined, preventComposer = false) => {
            startECRTMetric(labelID, elementID);

            const fetchElementThenCompose = async () => {
                // Using the getter to prevent having elements in dependency of the callback
                const [element] = getElementsFromIDs([elementID || '']);

                if (isMessage(element) && isDraft(element) && !preventComposer) {
                    void onCompose({
                        type: ComposeTypes.existingDraft,
                        existingDraft: { localID: element.ID as string, data: element as Message },
                        fromUndo: false,
                    });
                }
                if (isConversationContentView && isMessage(element)) {
                    onMessageLoad();
                    history.push(
                        setParamsInLocation(history.location, {
                            labelID,
                            elementID: (element as Message).ConversationID,
                            messageID: element.ID,
                        })
                    );
                } else {
                    onMessageLoad();
                    history.push(setParamsInLocation(history.location, { labelID, elementID: element.ID }));
                }
                // We preserve checkbox state when opening a new element in row mode
                if (columnMode) {
                    handleCheckAll(false);
                }
            };

            void fetchElementThenCompose();
        },
        [onCompose, isConversationContentView, labelID, history]
    );

    // Reset select all state when location is changing (e.g. if we change folder, we need to reset the select all state)
    useEffect(() => {
        if (selectAll) {
            setSelectAll(false);
        }
    }, [location.pathname, location.hash]);

    // Track filter changes that might happen through URL manipulation or browser navigation
    const prevFilterStringRef = useRef(JSON.stringify(filter));
    useEffect(() => {
        const currentFilterString = JSON.stringify(filter);
        // Only reset if the filter has actually changed
        if (prevFilterStringRef.current !== currentFilterString) {
            setSelectAll(false);
            handleCheckAll(false);
            prevFilterStringRef.current = currentFilterString;
        }
    }, [filter]);

    // Set the ref so that we can uncheck all elements from the list when performing select all action with drag and drop
    useEffect(() => {
        setCheckAllRef(handleCheckAll);
    }, [handleCheckAll]);

    const handleMarkAs = useCallback(
        async (status: MARK_AS_STATUS, sourceAction: SOURCE_ACTION) => {
            const isUnread = status === MARK_AS_STATUS.UNREAD;
            const elements = getElementsFromIDs(selectedIDs);
            if (isUnread) {
                handleBack();
            }
            await markAs({
                elements,
                labelID,
                status,
                selectAll,
                onCheckAll: handleCheckAll,
                sourceAction,
                silent: true,
            });
        },
        [selectedIDs, labelID, handleBack, selectAll]
    );

    const handleDelete = useCallback(
        async (sourceAction: SOURCE_ACTION) => {
            await permanentDelete(selectedIDs, sourceAction, selectAll);
        },
        [selectedIDs, permanentDelete, selectAll]
    );

    const {
        elementRef,
        moveScheduledModal,
        moveSnoozedModal,
        moveToSpamModal,
        deleteSelectionModal: deleteSelectionShortcutModal,
        deleteAllModal: deleteAllShortcutModal,
        moveToFolder,
        selectAllMoveModal,
        selectAllMarkModal: markAllModal,
    } = useMailboxHotkeys(
        {
            labelID,
            elementID,
            messageID,
            elementIDs,
            checkedIDs,
            selectedIDs,
            focusID,
            columnLayout,
            isMessageOpening,
            location,
            labelDropdownToggleRefProps: labelDropdownToggleRef,
            moveDropdownToggleRefProps: moveDropdownToggleRef,
        },
        {
            focusLastID,
            focusFirstID,
            focusNextID,
            focusPreviousID,
            handleBack,
            handleCheck,
            handleCheckOnlyOne,
            handleCheckRange,
            handleElement,
            handleFilter,
            handleCheckAll,
            setFocusID,
            showCommander,
        }
    );

    const handleMove = useCallback(
        async (LabelID: string, sourceAction: SOURCE_ACTION) => {
            const folderName = getFolderName(LabelID, folders);
            const elements = getElementsFromIDs(selectedIDs);
            await moveToFolder({
                elements,
                sourceLabelID: labelID,
                destinationLabelID: LabelID,
                folderName,
                selectAll,
                sourceAction: sourceAction,
            });
            if (selectedIDs.includes(elementID || '')) {
                handleBack();
            }
        },
        [selectedIDs, elementID, labelID, labelIDs, folders, handleBack, selectAll]
    );

    const toolbar = (toolbarInHeader?: boolean) => {
        return (
            <Toolbar
                labelID={labelID}
                elementID={elementID}
                messageID={messageID}
                selectedIDs={selectedIDs}
                checkedIDs={checkedIDs}
                elementIDs={elementIDs}
                columnMode={columnMode}
                conversationMode={conversationMode}
                onCheck={handleCheck}
                page={page}
                total={total}
                isSearch={isSearch}
                onPage={handlePage}
                onBack={handleBack}
                onElement={handleElement}
                onMarkAs={handleMarkAs}
                onMove={handleMove}
                onDelete={handleDelete}
                labelDropdownToggleRef={labelDropdownToggleRef}
                moveDropdownToggleRef={moveDropdownToggleRef}
                bordered
                sort={sort}
                onSort={handleSort}
                onFilter={handleFilter}
                filter={filter}
                mailSettings={mailSettings}
                toolbarInHeader={toolbarInHeader}
                loading={loading}
                onCheckAll={handleCheckAll}
            />
        );
    };

    const commanderList = useMemo<CommanderItemInterface[]>(
        () => [
            {
                icon: 'envelope',
                label: c('Commander action').t`New message`,
                value: 'compose',
                action: () => onCompose({ type: ComposeTypes.newMessage, action: MESSAGE_ACTIONS.NEW }),
                shortcuts: ['N'],
            },
            {
                icon: 'tag',
                label: c('Commander action').t`Create a new label`,
                value: 'create-label',
                action: () => createLabel('label'),
            },
            {
                icon: 'folder',
                label: c('Commander action').t`Create a new folder`,
                value: 'create-folder',
                action: () => createLabel('folder'),
            },
            {
                icon: 'envelope-magnifying-glass',
                label: c('Commander action').t`Search`,
                value: 'search',
                action: () => {
                    const button = document.querySelector('[data-shorcut-target="searchbox-button"]') as HTMLElement;
                    button?.dispatchEvent(
                        new MouseEvent('click', {
                            view: window,
                            bubbles: true,
                            cancelable: false,
                        })
                    );
                },
                shortcuts: ['/'],
            },
            {
                icon: 'inbox',
                label: c('Commander action').t`Go to Inbox`,
                value: 'inbox',
                action: () => navigateTo(MAILBOX_LABEL_IDS.INBOX),
                shortcuts: ['G', 'I'],
            },
            {
                icon: 'file-lines',
                label: c('Commander action').t`Go to Drafts`,
                value: 'drafts',
                action: () =>
                    navigateTo(
                        hasBit(mailSettings.ShowMoved, SHOW_MOVED.DRAFTS)
                            ? MAILBOX_LABEL_IDS.ALL_DRAFTS
                            : MAILBOX_LABEL_IDS.DRAFTS
                    ),
                shortcuts: ['G', 'D'],
            },
            {
                icon: 'paper-plane',
                label: c('Commander action').t`Go to Sent`,
                value: 'sent',
                action: () =>
                    navigateTo(
                        hasBit(mailSettings.ShowMoved, SHOW_MOVED.SENT)
                            ? MAILBOX_LABEL_IDS.ALL_SENT
                            : MAILBOX_LABEL_IDS.SENT
                    ),
                shortcuts: ['G', 'E'],
            },
            {
                icon: 'archive-box',
                label: c('Commander action').t`Go to Archive`,
                value: 'archive',
                action: () => navigateTo(MAILBOX_LABEL_IDS.ARCHIVE),
                shortcuts: ['G', 'A'],
            },
            {
                icon: 'star',
                label: c('Commander action').t`Go to Starred`,
                value: 'starred',
                action: () => navigateTo(MAILBOX_LABEL_IDS.STARRED),
                shortcuts: ['G', '*'],
            },
            {
                icon: 'fire',
                label: c('Commander action').t`Go to Spam`,
                value: 'spam',
                action: () => navigateTo(MAILBOX_LABEL_IDS.SPAM),
                shortcuts: ['G', 'S'],
            },
            {
                icon: 'trash',
                label: c('Commander action').t`Go to Trash`,
                value: 'trash',
                action: () => navigateTo(MAILBOX_LABEL_IDS.TRASH),
                shortcuts: ['G', 'T'],
            },
        ],
        []
    );

    const canShowDrawer = drawerSidebarButtons.length > 0;

    /**
     * Temporary: Mailbox container side effects
     */
    useMailboxContainerSideEffects({ labelID, isSearch, elementsParams, handleCheckAll, elements, loading });
    useScrollToTop(listRef as RefObject<HTMLElement>, [page, labelID, sort, filter, searchParameters]);

    return (
        <MailboxContainerContextProvider
            isResizing={isResizing}
            containerRef={messageContainerRef}
            elementID={elementID}
        >
            <div
                ref={elementRef}
                tabIndex={-1}
                className="flex-1 flex flex-column flex-nowrap outline-none"
                data-testid="mailbox"
            >
                <MailHeader
                    elementID={elementID}
                    selectedIDs={selectedIDs}
                    labelID={labelID}
                    toolbar={toolbar(true)}
                    settingsButton={<InboxQuickSettingsAppButton />}
                />

                <PrivateMainArea
                    className="flex"
                    hasToolbar
                    hasRowMode={!showContentPanel}
                    ref={mainAreaRef}
                    drawerSidebar={<DrawerSidebar buttons={drawerSidebarButtons} />}
                    drawerVisibilityButton={canShowDrawer ? <DrawerVisibilityButton /> : undefined}
                    mainBordered={canShowDrawer && !!showDrawerSidebar}
                >
                    <List
                        ref={listRef}
                        listContainerRef={listContainerRef}
                        show={showList}
                        conversationMode={conversationMode}
                        labelID={labelID}
                        loading={loading}
                        placeholderCount={placeholderCount}
                        columnLayout={columnLayout}
                        elementID={elementID}
                        elements={elements}
                        checkedIDs={checkedIDs}
                        onCheck={handleCheck}
                        onClick={handleElement}
                        isSearch={isSearch}
                        page={page}
                        total={total}
                        onPage={handlePage}
                        onFocus={handleFocus}
                        onCheckOne={handleCheckOne}
                        filter={filter}
                        resizeAreaRef={resizeAreaRef}
                        enableResize={enableResize}
                        resetWidth={resetWidth}
                        showContentPanel={showContentPanel}
                        scrollBarWidth={scrollBarWidth}
                        onMarkAs={handleMarkAs}
                        onDelete={handleDelete}
                        onMove={handleMove}
                        onBack={handleBack}
                        userSettings={userSettings}
                        toolbar={toolbar()}
                        onCheckAll={handleCheckAll}
                    />
                    <ErrorBoundary>
                        <section
                            className={clsx([
                                'view-column-detail flex flex-column flex-1 *:min-size-auto flex-nowrap relative',
                                !showContentPanel && 'hidden',
                                showContentView ? 'overflow-hidden' : 'overflow-auto',
                            ])}
                            aria-label={c('Info').t`Message view`}
                        >
                            {showPlaceholder && (
                                <MailboxContainerPlaceholder
                                    showPlaceholder={showContentPanel}
                                    welcomeFlag={welcomeFlag}
                                    labelID={labelID}
                                    checkedIDs={checkedIDs}
                                    handleCheckAll={handleCheckAll}
                                />
                            )}
                            {showContentView &&
                                (isConversationContentView ? (
                                    <ConversationView
                                        hidden={showPlaceholder}
                                        labelID={labelID}
                                        messageID={messageID}
                                        mailSettings={mailSettings}
                                        conversationID={elementID as string}
                                        onBack={handleBack}
                                        onMessageReady={onMessageReady}
                                        columnLayout={columnLayout}
                                        isComposerOpened={isComposerOpened}
                                        containerRef={messageContainerRef}
                                    />
                                ) : (
                                    <MessageOnlyView
                                        hidden={showPlaceholder}
                                        labelID={labelID}
                                        mailSettings={mailSettings}
                                        messageID={elementID as string}
                                        onBack={handleBack}
                                        onMessageReady={onMessageReady}
                                        columnLayout={columnLayout}
                                        isComposerOpened={isComposerOpened}
                                    />
                                ))}
                        </section>
                    </ErrorBoundary>
                </PrivateMainArea>
            </div>
            {commanderRender ? <Commander list={commanderList} {...commanderModalProps} /> : null}
            {deleteSelectionModal}
            {deleteAllModal}
            {deleteSelectionShortcutModal}
            {deleteAllShortcutModal}
            {moveScheduledModal}
            {moveSnoozedModal}
            {moveToSpamModal}
            {selectAllMoveModal}
            {selectAllMarkModal}
            {markAllModal}
        </MailboxContainerContextProvider>
    );
};

export default memo(MailboxContainer);
