import type { DragEvent, MouseEventHandler } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ErrorBoundary, useActiveBreakpoint, useHandler, useWindowSize } from '@proton/components';
import { getHasAssistantStatus } from '@proton/llm/lib';
import { useAssistant } from '@proton/llm/lib/hooks/useAssistant';
import { OpenedAssistantStatus } from '@proton/llm/lib/types';
import clsx from '@proton/utils/clsx';

import { selectComposer } from 'proton-mail/store/composers/composerSelectors';
import { composerActions } from 'proton-mail/store/composers/composersSlice';
import { useMailDispatch, useMailSelector } from 'proton-mail/store/hooks';

import { ADVANCED_SEARCH_OVERLAY_CLOSE_EVENT, DRAG_ADDRESS_KEY } from '../../constants';
import { computeComposerStyle, getComposerDimension, shouldBeMaximized } from '../../helpers/composerPositioning';
import useComposerDrag from '../../hooks/composer/useComposerDrag';
import type { ComposerID } from '../../store/composers/composerTypes';
import type { ComposerAction } from './Composer';
import Composer from './Composer';
import ComposerTitleBar from './ComposerTitleBar';

interface Props {
    index: number;
    count: number;
    focus: boolean;
    onFocus: () => void;
    onClose: () => void;
    composerID: ComposerID;
    drawerOffset: number;
}

const ComposerFrame = ({ index, count, focus, onFocus, onClose: inputOnClose, composerID, drawerOffset }: Props) => {
    const composerFrameRef = useRef<HTMLDivElement>(null);
    const composerRef = useRef<ComposerAction>(null);
    // Ref to focus minimize button, otherwise focus is still on Composer, and it's still possible to edit fields
    const minimizeButtonRef = useRef<HTMLButtonElement>(null);
    // Needed for re-renders when window size changes
    const [, windowHeight] = useWindowSize();
    const dispatch = useMailDispatch();
    const { isMaximized, isMinimized } = useMailSelector((store) => selectComposer(store, composerID));
    const breakpoints = useActiveBreakpoint();

    const toggleMinimizeComposer = useCallback(() => {
        dispatch(composerActions.toggleMinimizeComposer(composerID));
    }, [composerID]);
    const toggleMaximizeComposer = useCallback(() => {
        dispatch(composerActions.toggleMaximizeComposer(composerID));
    }, [composerID]);

    const composerDimension = getComposerDimension();

    const { style, customClasses } = computeComposerStyle({
        composerDimension,
        index,
        count,
        isMinimized,
        isMaximized,
        isSmallViewport: breakpoints.viewportWidth['<=small'],
        drawerOffset,
    });

    const {
        start: handleStartDragging,
        offset: dragOffset,
        isDragging,
    } = useComposerDrag({
        composerDimension,
        composerIndex: index,
        isMaximized,
        isMinimized,
        totalComposers: count,
        drawerOffset,
    });

    const { closeAssistant, openedAssistants } = useAssistant(composerID);

    const isAssistantExpanded = useMemo(() => {
        return getHasAssistantStatus(openedAssistants, composerID, OpenedAssistantStatus.EXPANDED);
    }, [composerID, openedAssistants]);

    // onClose handler can be called in a async handler
    // Input onClose ref can change in the meantime
    const onClose = useHandler(inputOnClose);

    // Current subject comming from the composer
    const [subject, setSubject] = useState('');

    const handleDragEnter = (event: DragEvent) => {
        if (event.dataTransfer?.types.includes(DRAG_ADDRESS_KEY)) {
            onFocus();
        }
    };

    // Automatic maximize if height too small
    useEffect(() => {
        const shouldMaximized = shouldBeMaximized(composerDimension, windowHeight);

        if (!isMaximized && shouldMaximized) {
            toggleMaximizeComposer();
        }
    }, [windowHeight]);

    const handleClose: MouseEventHandler<HTMLButtonElement> = (e) => {
        // Propagation triggers click events on the parent div
        e.stopPropagation();
        closeAssistant(composerID);
        composerRef?.current?.close();
    };

    const handleClick = () => {
        if (isMinimized && !isDragging) {
            toggleMinimizeComposer();
        }
        onFocus();
    };

    const handleFocus = () => {
        if (!focus) {
            document.dispatchEvent(new CustomEvent(ADVANCED_SEARCH_OVERLAY_CLOSE_EVENT));
            document.dispatchEvent(new CustomEvent('dropdownclose'));
        }

        onFocus();
    };

    return (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions
        <section
            ref={composerFrameRef}
            className={clsx([
                `composer rounded flex flex-nowrap flex-column outline-none ${customClasses}`,
                !focus && 'composer--is-blur',
                isMinimized && 'composer--is-minimized',
                isMaximized && 'composer--is-maximized',
            ])}
            style={{ ...style, '--composer-drag-offset': `${dragOffset}px` }}
            onFocus={handleFocus}
            onClick={handleClick}
            onDragEnter={handleDragEnter}
            tabIndex={-1}
            data-testid={composerID}
            aria-labelledby={`composer-title-${composerID}`}
        >
            {!isAssistantExpanded && (
                <ComposerTitleBar
                    title={subject}
                    minimized={isMinimized}
                    maximized={isMaximized}
                    toggleMinimized={toggleMinimizeComposer}
                    toggleMaximized={toggleMaximizeComposer}
                    onClose={handleClose}
                    handleStartDragging={handleStartDragging}
                    minimizeButtonRef={minimizeButtonRef}
                    composerID={composerID}
                />
            )}
            <ErrorBoundary initiative="composer">
                <Composer
                    ref={composerRef}
                    composerFrameRef={composerFrameRef}
                    toggleMinimized={toggleMinimizeComposer}
                    toggleMaximized={toggleMaximizeComposer}
                    onFocus={onFocus}
                    onClose={onClose}
                    onSubject={(subject) => setSubject(subject)}
                    isFocused={focus}
                    composerID={composerID}
                    minimizeButtonRef={minimizeButtonRef}
                />
            </ErrorBoundary>
        </section>
    );
};

export default ComposerFrame;
