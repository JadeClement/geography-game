"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import {
  clampAvatarCropOffset,
  cropAvatarImage,
  getAvatarCoverScale,
} from "@/lib/avatars";
import {
  avatarCropActions,
  avatarCropHint,
  avatarCropImage,
  avatarCropModalCard,
  avatarCropViewport,
  avatarCropZoomInput,
  avatarCropZoomLabel,
  avatarCropZoomRow,
  modalClose,
  modalOverlay,
  modalSubtitle,
  modalTitle,
  primaryBtn,
  secondaryBtn,
} from "@/lib/ui";

const VIEWPORT_SIZE = 280;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

function getPointerPosition(event) {
  if ("clientX" in event) {
    return { x: event.clientX, y: event.clientY };
  }
  const touch = event.touches?.[0] ?? event.changedTouches?.[0];
  return touch ? { x: touch.clientX, y: touch.clientY } : null;
}

export default function AvatarCropModal({ open, imageSrc, imageWidth, imageHeight, onCancel, onApply }) {
  const dialogRef = useFocusTrap(open);
  const [offset, setOffset] = useState({ offsetX: 0, offsetY: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const dragRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setOffset({ offsetX: 0, offsetY: 0 });
    setZoom(MIN_ZOOM);
    setApplying(false);
    setError("");
  }, [open, imageSrc]);

  const coverScale = useMemo(() => {
    if (!imageWidth || !imageHeight) return 1;
    return getAvatarCoverScale(imageWidth, imageHeight, VIEWPORT_SIZE);
  }, [imageWidth, imageHeight]);

  const clampedOffset = useMemo(() => {
    if (!imageWidth || !imageHeight) return offset;
    return clampAvatarCropOffset(
      offset.offsetX,
      offset.offsetY,
      imageWidth,
      imageHeight,
      VIEWPORT_SIZE,
      zoom
    );
  }, [imageHeight, imageWidth, offset.offsetX, offset.offsetY, zoom]);

  const imageStyle = useMemo(() => {
    if (!imageWidth || !imageHeight) return undefined;
    const displayScale = coverScale * zoom;
    return {
      width: imageWidth * displayScale,
      height: imageHeight * displayScale,
      transform: `translate(-50%, -50%) translate(${clampedOffset.offsetX}px, ${clampedOffset.offsetY}px)`,
    };
  }, [clampedOffset.offsetX, clampedOffset.offsetY, coverScale, imageHeight, imageWidth, zoom]);

  const updateZoom = (nextZoom) => {
    const zoomValue = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    setZoom(zoomValue);
    setOffset((current) =>
      clampAvatarCropOffset(
        current.offsetX,
        current.offsetY,
        imageWidth,
        imageHeight,
        VIEWPORT_SIZE,
        zoomValue
      )
    );
  };

  const beginDrag = (event) => {
    if (applying) return;
    const point = getPointerPosition(event);
    if (!point) return;
    event.preventDefault();
    dragRef.current = {
      startX: point.x,
      startY: point.y,
      originX: clampedOffset.offsetX,
      originY: clampedOffset.offsetY,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = getPointerPosition(event);
    if (!point) return;
    event.preventDefault();
    setOffset(
      clampAvatarCropOffset(
        drag.originX + (point.x - drag.startX),
        drag.originY + (point.y - drag.startY),
        imageWidth,
        imageHeight,
        VIEWPORT_SIZE,
        zoom
      )
    );
  };

  const endDrag = (event) => {
    if (!dragRef.current) return;
    if (event?.pointerId != null) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    dragRef.current = null;
  };

  const handleApply = async () => {
    setApplying(true);
    setError("");
    try {
      const cropped = await cropAvatarImage(imageSrc, {
        offsetX: clampedOffset.offsetX,
        offsetY: clampedOffset.offsetY,
        zoom,
        viewportSize: VIEWPORT_SIZE,
      });
      onApply(cropped);
    } catch (applyError) {
      setError(applyError.message || "Could not crop image.");
      setApplying(false);
    }
  };

  if (!open || !imageSrc) return null;

  return (
    <div className={modalOverlay} onClick={onCancel}>
      <div
        ref={dialogRef}
        className={avatarCropModalCard}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-crop-title"
      >
        <button type="button" className={modalClose} onClick={onCancel} aria-label="Close">
          ×
        </button>

        <h2 id="avatar-crop-title" className={modalTitle}>
          Position your photo
        </h2>
        <p className={modalSubtitle}>Drag to move. Use the slider to zoom.</p>

        <div
          className={avatarCropViewport}
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          role="presentation"
        >
          <img
            src={imageSrc}
            alt=""
            draggable={false}
            className={avatarCropImage}
            style={imageStyle}
          />
        </div>
        <p className={avatarCropHint}>Only the area inside the circle will be saved.</p>

        <div className={avatarCropZoomRow}>
          <label className={avatarCropZoomLabel} htmlFor="avatar-crop-zoom">
            Zoom
          </label>
          <input
            id="avatar-crop-zoom"
            className={avatarCropZoomInput}
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={applying}
            onChange={(event) => updateZoom(Number(event.target.value))}
          />
        </div>

        {error && (
          <p className="mt-3 m-0 text-sm text-error" role="alert">
            {error}
          </p>
        )}

        <div className={avatarCropActions}>
          <button
            type="button"
            className={primaryBtn}
            disabled={applying}
            onClick={handleApply}
          >
            {applying ? "Applying…" : "Use photo"}
          </button>
          <button
            type="button"
            className={secondaryBtn}
            disabled={applying}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
