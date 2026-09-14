import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, computed,
  effect, inject, input, signal, viewChild
} from '@angular/core';
import { ReducedMotion } from '@core/a11y/reduced-motion.service';
import { LocaleService } from '@core/i18n/locale.service';

/** The thirteen administrative regions, English and Arabic. */
const REGION_NAMES: Readonly<Record<string, readonly [string, string]>> = {
  najran: ['Najran', 'نجران'],
  riyadh: ['Riyadh', 'الرياض'],
  eastern: ['Eastern Province', 'المنطقة الشرقية'],
  madinah: ['Madinah', 'المدينة المنورة'],
  qassim: ['Qassim', 'القصيم'],
  hail: ["Ha'il", 'حائل'],
  tabuk: ['Tabuk', 'تبوك'],
  northern: ['Northern Borders', 'الحدود الشمالية'],
  jawf: ['Al Jawf', 'الجوف'],
  bahah: ['Al Bahah', 'الباحة'],
  asir: ['Asir', 'عسير'],
  jazan: ['Jazan', 'جازان'],
  makkah: ['Makkah', 'مكة المكرمة']
};

/** How much of the map must be on screen before the entrance plays. */
const ENTRANCE_RATIO = 0.18;
/** A tapped region hands the highlight back rather than reading as a selection. */
const TOUCH_HOLD_MS = 2400;

/**
 * The Kingdom: the hero's second column, and a visual rather than a control.
 *
 * No region navigates, filters, carries a count or opens a card. Hovering brings
 * one of the thirteen administrative regions forward and lets the other twelve
 * recede, and that is the whole interaction.
 *
 * The geometry is Natural Earth 1:10m admin-1 (public domain), quantised on a
 * shared lon/lat grid so a border between two regions is the same sequence of
 * points on both sides and can never open a sliver. It is carried over
 * unchanged: re-tracing it would be a redesign, not a port.
 *
 * The legacy version cached nothing and re-bound nothing, because a render could
 * replace this whole subtree underneath it. Here the component owns its subtree
 * for its entire life, so the hovered region is a signal and a lit outline is a
 * class binding rather than a `classList.toggle` against a fresh DOM query.
 */
@Component({
  selector: 'tf-kingdom-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tf-kingdom-stage" data-kingdom role="img" #stage
         [attr.aria-label]="label()"
         [class.is-in]="entered()"
         [class.is-live]="!!active()"
         (pointerover)="hover($event)"
         (pointermove)="track($event)"
         (pointerleave)="leave($event)"
         (pointerdown)="tap($event)">
        <svg class="tf-kd-svg" viewBox="0 0 1000 826" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
        <defs>
        <radialGradient id="tf-kd-orb-grad">
        <stop offset="0%" stop-color="var(--kd-orb)" stop-opacity=".9" />
        <stop offset="45%" stop-color="var(--kd-orb)" stop-opacity=".28" />
        <stop offset="100%" stop-color="var(--kd-orb)" stop-opacity="0" />
        </radialGradient>
        <clipPath id="tf-kd-clip"><use href="#tf-kd-border" /></clipPath>
        </defs>

        <!-- Neon halo: a blurred stroke-only copy of the same thirteen paths sitting
        under the crisp ones, so every regional border reads as a lit line
        rather than a hairline. One blur pass for the whole layer. -->
        <g class="tf-kd-glow">
        <use href="#tf-kd-najran" data-glow="najran" pointer-events="none" />
        <use href="#tf-kd-riyadh" data-glow="riyadh" pointer-events="none" />
        <use href="#tf-kd-eastern" data-glow="eastern" pointer-events="none" />
        <use href="#tf-kd-madinah" data-glow="madinah" pointer-events="none" />
        <use href="#tf-kd-qassim" data-glow="qassim" pointer-events="none" />
        <use href="#tf-kd-hail" data-glow="hail" pointer-events="none" />
        <use href="#tf-kd-tabuk" data-glow="tabuk" pointer-events="none" />
        <use href="#tf-kd-northern" data-glow="northern" pointer-events="none" />
        <use href="#tf-kd-jawf" data-glow="jawf" pointer-events="none" />
        <use href="#tf-kd-bahah" data-glow="bahah" pointer-events="none" />
        <use href="#tf-kd-asir" data-glow="asir" pointer-events="none" />
        <use href="#tf-kd-jazan" data-glow="jazan" pointer-events="none" />
        <use href="#tf-kd-makkah" data-glow="makkah" pointer-events="none" />
        </g>

        <!-- 13 administrative regions. These paths are the hover targets; every
        other layer is pointer-transparent so the cursor always resolves to a
        region and never to a border or a node. -->
        <g class="tf-kd-regions">
        <path id="tf-kd-najran" class="tf-kd-region" data-region="najran" style="--i:11" d="M608.9 784.3l-12.7 7.4l-8.9 -0.5l-10.6 -14.7l-1.6 -1l-18.1 2.5l-42 -4.2l-2.1 -0.7l-7.7 -4.4l-2.6 -0.7l-25.3 0.2l-4.2 1l-6.1 -0.7l-9.1 1.5l-2.8 -0.7l-2.1 2.7l-2.1 0.2l-2.6 -1.2l-1.9 1.5l-1.2 1.7l-2.1 -0.2l0 -2l-7.7 0l-4.2 -4.4l1.2 -6.4l0 -2.7l-1.2 -5.4l1.6 -15l-1.6 -7.6l1.4 -3.2l8.7 -9.6l6.8 -5.9l3.8 -6.9l2.3 -1.2l5.4 -1.2l4.9 -3.5l1.9 -3l0.5 -5l-1.9 -9.9l0.2 -1.2l2.3 -2.7l4.2 -2.7l0.5 -2.7l0 -6.5l16.4 9.9l7 2l12.2 1l109.8 -11.9l6.1 -1.7l-14.8 120.3z" />
        <path id="tf-kd-riyadh" class="tf-kd-region" data-region="riyadh" style="--i:6" d="M571.6 303l8 -1.3l2.1 1l7.7 7.6l2.1 2.9l16.7 7.1l1.4 1.6l0.9 3.7l1.4 72l1.9 2.8l16.7 12.1l13.6 14.2l2.1 3.3l3 8.2l0.7 6.2l-0.2 11.5l-26 208.1l-6.1 1.7l-109.8 11.9l-12.2 -1l-7 -2l-17.1 -10.4l-18.5 -16.9l-4.5 -7.7l-3.5 -4.2l-0.2 -3l1.9 -8.5l4.5 -8.3l-0.9 -4.3l-6.8 -8l-1.4 -2.5l-2.6 -3l-6.8 -6l-12.9 -19.4l-0.2 -3.3l2.1 -9.3l-0.5 -9.6l4 -7.8l-2.3 -20l1.2 -7.6l-2.6 -1.8l-6.6 -1l-8.9 1.8l-4 -2.3l-1.4 -3.3l0.2 -6.4l0.9 -3.3l-0.9 -2l-3.5 -2l-22.3 -1.8l-3 -1.8l-7 -16.1l-1.9 -8.4l-4.5 -12.5l-4.9 -3.8l-0.5 -4.4l0.9 -18.5l0.9 -6.9l-0.7 -2.8l4 -6.7l0.5 -3.9l4.7 -7.5l2.3 -1.5l2.1 0.3l10.3 4.1l10.8 0.8l6.8 -1l6.8 1.3l2.1 -0.8l2.1 -2.3l0.7 -3.4l-0.2 -1.3l-1.9 -3.1l0.7 -3.6l4.7 -6.2l5.4 -5.2l18.8 -5.2l8 -6.5l5.4 -8.1l3.8 -1.3l12.2 1.3l11 -0.8l5.4 0.3l1.6 -2.1l0.2 -4.4l-1.4 -6.5l-1.4 -2.3l-0.2 -2.9l0.7 -2.3l-0.5 -1.8l-8.9 -13.3l-4.5 -4.7l-0.7 -3.1l0.9 -9.2l-0.2 -3.7l3 -2.1l1.9 -0.3l1.4 -1.1l5.2 -7.1l4.5 -3.4l4.9 -2.9l0.5 -3.4l-3 -5.5l-7 -4.2l-0.9 -4.7l1.4 -4.5l4.7 -5.5l2.8 -1.1l3.8 3.2l3.3 -1.1l1.9 -2.9l6.6 5.3l1.4 2.4l1.9 5.8l2.1 2.6l13.4 7.6l7.5 1.6l8.4 8.7l3 1.8l1.9 0.5l8 0.3l4 1.1l14.5 10.2l4.5 1z" />
        <path id="tf-kd-eastern" class="tf-kd-region" data-region="eastern" style="--i:4" d="M709.1 263.8l5.9 1.6l-0.9 0.5l-2.1 -0.8l-2.8 1.3l-1.2 -0.5l0 -1.6l-2.3 0.3l-1.6 2.4l0 -1.3l0.7 -1.3l1.4 -1.1l2.3 0l0.7 0.5zM606.6 176l2.6 0.3l2.8 4.8l2.8 8.6l1.2 6.1l3.8 3.7l0.5 1.3l35.9 -0.3l3 2.4l0.5 4.3l-0.5 1.1l1.2 -1.1l0.5 0.8l-0.9 3.2l0.9 2.1l4.2 5.1l-1.2 2.9l2.6 5.3l-0.2 0.3l6.6 2.7l-2.3 1.1l6.8 8l-1.4 4.8l-0.7 0.3l0.5 -1.1l0.2 -3.7l-2.3 3.4l0.9 -2.9l-0.5 -1.1l-1.6 6.1l1.4 -1.6l0.2 2.9l0.9 -0.3l0.2 -0.8l0.2 2.4l1.4 -0.5l-0.2 1.9l-0.5 0l0.7 1.6l-1.6 -0.8l-0.5 0.8l1.9 0.3l1.4 -1.6l0.2 0.8l-0.7 1.6l0.2 1.1l0.9 0l-0.5 -1.6l3 -1.1l2.1 1.9l1.9 0.8l0.5 0.8l-0.9 0.5l1.6 0l-0.5 -0.8l1.6 0.8l2.3 0l1.2 -0.8l2.8 0.8l3.3 3.7l0.2 1.3l-1.2 -0.5l-0.2 -0.8l-0.9 1.1l-2.6 -0.3l-1.4 1.1l-0.2 -1.1l-2.6 1.1l4.5 2.4l1.4 -1.6l0.9 0.5l-1.9 2.4l0 2.1l2.6 -1.6l1.6 0.8l-0.5 1.1l0.7 3.2l-0.2 2.1l0.5 1.1l0.7 -0.3l0.2 1.3l0.9 -0.5l-0.2 -0.8l1.2 -0.5l1.2 0.8l-0.9 2.4l-1.2 0l1.9 1.3l1.6 -1.3l-0.5 0.8l4.5 0.5l-1.6 -2.1l1.2 -0.8l1.9 0.8l0.7 -1.1l-0.5 2.9l0.7 2.1l6.3 7.9l5.9 3.2l1.6 1.6l3.3 0l2.8 2.4l3.3 4.5l4.2 3.4l0 1.3l-3 -2.6l-3.3 -0.5l-0.9 -2.6l-0.9 3.9l0.9 1.3l0 4.2l1.6 4.7l1.6 1.3l5.4 2.6l0.9 1.8l0 9.4l-0.5 1l-0.9 0.5l-0.2 -1l-0.9 0.8l0.2 3.4l-0.9 3.4l-0.9 -1.3l-0.2 -2.3l-1.9 -1.3l-0.7 -2.9l-1.9 -0.8l-2.1 3.1l0.9 3.7l-0.2 3.7l0.7 0.3l1.2 -1.3l-0.2 -0.8l1.9 1l0.5 1l1.2 0.3l1.4 2.9l-0.9 1l1.4 5.2l4.9 7l0.2 2.6l-0.7 -2.6l-4.2 -2.9l-0.2 1l1.9 2.1l0.7 -0.5l1.9 3.6l6.6 8.1l-0.7 -2.3l1.2 -0.3l1.2 2.3l2.6 1l2.8 8.6l0.5 4.1l0.7 2.1l-0.2 2.1l0.7 3.4l0.7 0.5l0.2 -0.8l3.8 4.1l0.9 3.4l2.1 1.8l0.7 5.7l1.4 2.3l0.7 0l1.2 -1l3.3 5.7l2.3 2.6l5.2 1.3l2.6 0l2.3 -0.8l3.3 -2.6l3 0.3l1.2 0.8l-0.7 1.8l0.5 0.8l0 2.1l1.6 -0.8l1.9 -3.1l0.7 -0.3l0.2 -1.8l2.3 0.5l0.5 1.3l2.1 0.5l0 0.5l-2.6 1l-2.3 3.4l-4.2 4.4l-0.5 3.1l-0.7 0.3l0 1.8l6.3 -1l3.8 1.3l1.4 1.5l2.1 0.8l0.5 8l46 59.3l119.4 16.3l0.7 -0.3l3 -4.1l21.3 36.8l-31 99.7l-140.7 49.8l-133.7 19.1l-6.6 2.5l-38.9 20.3l-26.7 33.7l-6.1 16.5l-1.4 1.7l14.8 -120.3l26 -208.1l0.2 -11.5l-0.7 -6.2l-3 -8.2l-4 -5.7l-11.7 -11.8l-17.6 -13.2l-0.9 -1.8l-1.6 -73.5l-2.6 -4.2l-16.2 -6.5l-2.1 -2.9l-8.7 -8.4l-2.1 -0.3l-8.2 1.3l-3.3 -1l-14.5 -10.2l-4 -1.1l-8 -0.3l-2.8 -0.8l-11.5 -10.8l-6.6 -1.1l-14.5 -8.7l-1.6 -2.9l-2.6 -6.9l-7.3 -5.8l-1.6 -2.9l0.5 -4.5l2.1 -4.8l10.3 -12.7l16.4 -31.2l6.3 -8.6l4.7 -4.3l6.6 -3.5l25.8 -9.9l7.3 0.3l34.5 4.6z" />
        <path id="tf-kd-madinah" class="tf-kd-region" data-region="madinah" style="--i:7" d="M182.8 293.3l2.6 -1.1l5.9 -3.9l2.8 0.5l4.5 2.1l2.3 -0.5l0 -3.7l0.5 -0.8l2.1 1.1l1.2 3.2l2.8 1.8l5.9 2.4l5.6 4.2l4.2 1l4.7 0l19.5 -3.2l2.1 0.8l2.3 3.1l1.2 3.1l-0.7 5l-2.1 4.7l0.5 2.4l1.9 1.3l4.5 -0.3l1.4 1.8l0.2 1l-2.6 20.4l1.6 5.7l0.7 5.2l-0.5 14l2.8 4.7l2.8 1l2.3 -0.3l13.8 -4.7l10.3 -0.8l2.6 -2.1l4.5 -5.2l4.2 -1.6l8.2 -0.5l13.1 2.1l14.3 4.4l1.2 2.3l-0.7 15.8l1.4 2.6l2.1 1.6l6.8 1.8l2.3 4.1l2.3 9.6l1.4 3.1l4.9 3.9l-0.5 3.9l-0.7 1.8l-3.3 4.9l0.7 5.9l-0.9 3.9l-0.5 13.6l-9.1 -0.8l-2.6 2.1l0 2.3l1.4 5.4l-0.9 4.9l-3.5 4.1l-8.4 3.6l-8.2 4.9l-1.4 1.5l-0.5 1.3l0.2 1.3l7.7 5.1l0.5 1.3l-1.4 2.3l-6.6 2.6l-2.8 2l-6.6 6.6l-13.4 10.7l-6.3 8.6l-2.3 0.5l-8.2 -2.3l-1.4 0.3l-8 5.8l-3.3 0.5l-3.3 -0.5l-1.4 -1.5l-0.2 -2l0.9 -4.3l-2.3 -4.8l-2.3 -1.5l-4 -1.3l-0.9 -1.8l3.3 -8.1l-0.2 -5.9l-1.4 -1.5l-2.1 -0.5l-4.5 0.5l-9.8 3.3l-3.8 0.5l-1.4 -1.3l-0.9 -3.8l-2.3 -0.5l-6.8 1l-1.6 -0.3l-10.1 -10l-3 -4.1l-1.2 -0.5l-4.7 1l-7.3 0.5l-0.7 -4.6l-1.4 -2l0 -1l-0.9 0.8l-0.9 -0.3l0.5 1.3l1.2 0.3l0 0.5l-1.6 -0.3l-0.9 -1l0 -2.3l-2.1 -2.8l-1.9 -7.2l-3 -2.1l-1.2 -2.3l-2.6 -1.3l-2.3 -2.6l-3.5 -1.5l-5.6 -5.1l-0.9 0.5l-5.2 -3.9l1.2 -1l1.2 -0.3l-0.5 -0.5l-1.6 0.8l-0.5 -0.8l0.9 -1.5l-1.4 0.3l0 2.6l-2.6 0l-8.9 -7.2l-1.6 0l-0.7 1l0.2 1l-2.1 0.3l-1.9 -1.5l-0.9 0.3l-2.8 -3.6l-1.6 -1.3l-0.5 -1.8l0.7 -1l0.9 0.8l0.5 -1l-3.8 -6.2l1.4 -4.9l2.6 -1.5l6.8 -0.5l6.6 -5.7l7.7 0.3l3 -2.8l0.7 -1.8l-0.5 -16.8l1.6 -11.9l-0.5 -1.8l-2.3 -1.3l-4 -0.5l-3.5 -11.4l-2.3 -3.4l-7.5 -7.3l-1.2 -4.2l-10.6 -5.7l-0.9 0.3l-1.6 1.6l-0.9 0l-1.6 -5.7l-3.3 -7.6l1.2 -4.2l3.5 -6.8l-0.5 -2.6l-1.9 -1.3l-6.6 -2.1l-2.8 -2.6l-1.6 -4.7l1.2 -12.4l-1.6 -6.1l-3 -1.8l-4.9 0.8l-0.7 -0.5l0 -1.8l1.9 -1.3l5.4 -1.3l13.1 -6.1l4.7 1.1l5.4 3.2l4.2 0.3l9.6 -5.3l1.9 0.3l2.3 2.6l3 9l2.6 4l2.3 1.6l8.9 1.1l1.2 1.3l0 2.4l1.2 1.8l3.8 2.6l0.2 4.2l0.5 0.8l0.9 0.3z" />
        <path id="tf-kd-qassim" class="tf-kd-region" data-region="qassim" style="--i:5" d="M469.6 278.5l2.3 -1.3l3.5 -5l2.1 -1.6l7 4.2l2.3 3.4l0.7 3.9l-1.2 2.4l-6.6 3.7l-4 3.9l-3.3 5l-1.4 1.1l-2.8 0.5l-2.1 1.8l0.2 6l-0.9 7.9l0.7 2.1l5.6 6.3l8 12l0.2 1.6l-0.7 3.9l2.6 7l0 8.3l-1.4 1.3l-5.4 -0.3l-11 0.8l-12.2 -1.3l-4.5 1.8l-2.1 2.6l-3.5 6l-3.3 2.1l-3.8 3.4l-18.8 5.2l-5.4 5.2l-4.7 6.2l-0.7 3.6l1.9 3.1l0.2 2.6l-1.6 3.4l-3.3 1.8l-6.8 -1.3l-8.9 1l-8.7 -0.8l-11.3 -4.4l-2.3 0.5l-1.9 1.8l-4 6.7l-4.9 -3.9l-1.4 -3.1l-2.3 -9.6l-2.3 -4.1l-6.8 -1.8l-3 -2.8l-0.7 -2.3l0.9 -14.8l-1.2 -2.3l-10.3 -3.1l1.9 -1.8l6.3 -1.3l9.1 -4.9l7 -1l1.2 -1.6l-3 -7.8l0.9 -2.6l2.3 -1.8l7.5 2.1l1.6 -1.3l-0.9 -7.3l2.1 -6.5l1.6 -1.3l5.4 -0.5l1.6 -1.6l2.6 -5.2l5.4 -6.3l12.4 -10l5.6 -3.7l12.2 -5.8l5.4 -8.7l2.3 -2.4l21.1 -11.3l4.7 -1.3l2.1 0.5l12 10.5l3.3 1.8l4.9 0l4.2 0.8z" />
        <path id="tf-kd-hail" class="tf-kd-region" data-region="hail" style="--i:3" d="M341.1 187l6.8 -1.6l6.3 -0.3l18.3 4.5l2.1 1.6l5.6 6.9l3 2.1l5.6 1.1l9.1 -4l2.6 0.5l1.2 6.9l0.7 1.6l2.6 2.1l2.6 0.5l7.7 0l8 3.5l2.8 -1.1l6.8 -4.3l2.8 0.5l1.9 1.9l8 14.4l4 10.4l4 4.2l2.8 1.3l14.5 2.1l4.9 2.6l8.9 8.5l0.7 1.6l-3.5 1.6l-4 5l-1.4 6.6l0.9 2.6l-2.1 1.6l-4.9 6.1l-2.1 0.3l-3 -0.8l-4.9 0l-3.3 -1.8l-12 -10.5l-2.1 -0.5l-4.7 1.3l-21.1 11.3l-4 4.5l-2.6 5.3l-2.8 2.4l-10.6 4.7l-5.6 3.7l-12.4 10l-5.4 6.3l-3.3 6.3l-7.3 1.6l-2.6 5.2l0.7 9.4l-1.6 1.3l-7.5 -2.1l-2.3 1.8l-0.9 2.6l0.5 2.1l2.6 5.7l-1.2 1.6l-7 1l-10.8 5.5l-4.7 0.8l-1.9 1.8l-4 -1.3l-13.1 -2.1l-11 1.3l-2.3 1.8l-4.5 5.2l-4.2 1.8l-7.7 0l-13.8 4.7l-4.2 -0.3l-2.8 -2.6l-0.9 -2.6l0.5 -14l-0.7 -5.2l-1.6 -6.8l2.6 -19.3l-0.7 -2.1l-0.9 -0.8l-4.5 0.3l-1.9 -1.3l-0.5 -2.4l2.8 -7.1l-0.2 -3.7l-0.9 -2.1l2.3 -3.4l4.2 -11.3l2.1 -2.9l7.5 -7.1l0.5 -2.1l-1.2 -2.4l-9.4 -5.8l-1.2 -2.1l-5.6 -22l-3.3 -3.7l-5.6 -4.8l-4.2 -2.4l-4 -3.5l-19.7 -5.3l-0.7 -1.3l7.3 -7.2l17.8 -8.3l8.2 -2.4l17.4 -9.9l18.8 -7.5l12.2 3.7l24.9 -5.9l6.8 0l14.3 4z" />
        <path id="tf-kd-tabuk" class="tf-kd-region" data-region="tabuk" style="--i:2" d="M119.7 362.2l0.7 1l0.5 2.6l-1.2 -1.6l-0.9 0.3l-0.9 -1.3l-0.7 0.5l0.7 -2.1l1.9 0.5zM111.5 362.8l4.5 2.1l-0.9 0l-0.2 0.8l0.9 0.5l1.2 -1.3l0.9 0.3l-2.8 2.9l-4.9 -4.9l-0.9 -2.1l2.3 1.8zM106.8 357.3l2.6 1.8l0.2 0.8l4.7 3.1l-0.5 0.5l-2.8 -2.3l-2.1 -0.8l-0.2 -1l-2.1 -1.6l-1.9 0.5l0.5 -1l1.6 0zM99.6 354.2l1.9 1.8l3.5 1l-0.7 1l-5.9 -2.9l-0.2 0.8l-2.3 -2.9l2.6 -3.1l-0.9 2.6l2.1 1.6zM100.5 349.5l0.9 0.3l-0.7 0.8l-2.3 -1.8l-0.2 -3.6l1.2 -1.8l-0.5 2.1l2.1 1.8l-0.5 2.3zM79.9 182.4l12.4 16.3l4.2 0.8l5.2 -2.1l11.3 -2.4l6.3 0.5l11 3.2l9.4 0l2.6 -2.4l3 -7.2l4.2 -2.9l2.8 -2.7l2.1 -0.3l1.4 1.9l-0.2 14.4l2.1 8.3l4.7 4.8l2.1 1.3l5.2 1.9l14.1 1.3l4.2 -1.6l4.5 1.9l2.1 -0.3l2.1 4l2.1 1.1l8.7 -3.7l4.2 0.5l1.9 1.3l0.7 1.3l19.7 5.3l5.4 4.5l2.8 1.3l8.9 8.5l6.1 23l3.3 2.9l6.8 4l1.2 2.4l-0.5 2.1l-1.6 2.1l-5.9 5l-3.5 5.8l-3.5 10l-1.6 1.8l-2.3 -3.1l-2.1 -0.8l-19.5 3.2l-7 -0.3l-1.9 -0.8l-5.6 -4.2l-7.5 -3.2l-1.2 -1.1l-1.2 -3.2l-2.1 -1.1l-0.7 1.6l0.2 2.9l-2.3 0.5l-6.1 -2.6l-2.8 0.5l-5.4 4.2l-2.3 0l-0.7 -5l-4.5 -3.4l-0.9 -4.2l-2.8 -1.1l-4.7 0l-4.5 -2.1l-4.5 -7.9l-1.6 -5.8l-1.9 -1.8l-1.9 -0.3l-9.6 5.3l-5.6 -0.8l-4 -2.6l-4.7 -1.1l-13.1 6.1l-6.3 1.8l-1.2 1.6l0.2 1.1l1.6 0.5l5.4 -0.3l2.3 2.9l0.9 4.5l-1.2 12.4l1.6 4.7l4 3.1l6.3 2.1l0.9 0.8l0 4.5l-3 5l-1.2 4.2l0.5 2.1l3.5 7.6l0.9 3.7l0.9 0l1.6 -1.6l2.1 0l9.4 5.7l2.6 6l7 6.3l1.4 2.3l3.8 11.7l5.4 0.8l1.2 2.6l-1.6 11.9l0.2 17.6l-2.3 3.4l-2.3 0.8l-5.4 -0.8l-2.1 1l-4.5 4.4l-4 1l-4.9 0.3l-2.6 3.1l-0.5 3.4l-7.3 -10.3l-0.5 -3.4l-1.2 0.8l-1.4 -1.3l-0.7 -1.8l3.3 0.3l1.6 -1.3l0.2 -2.6l0.9 -2.3l-1.4 -4.7l0.5 -2.8l-1.4 -4.4l-5.9 -6.5l-1.2 -3.9l-0.9 -1.3l0.7 -0.5l-0.5 -1.3l-2.6 -2.6l-0.9 -2.6l-3 -5.2l-2.1 -1l-3 -4.4l-0.9 0l0.5 1.8l-1.2 0l-4 -3.6l0 -1.6l-0.9 -0.3l-0.7 -2.6l2.1 -3.4l0 -2.9l-1.6 -2.3l-3 -1.3l-3.3 -0.5l-5.2 -10.5l-1.9 -2.9l-3.5 -8.6l-3.8 -6.6l-6.1 -6.8l-2.3 -4.7l-0.9 -3.2l-0.7 0.3l-1.9 -2.6l-3 -2.6l-3.8 -5l-1.4 -4l0.7 -1.1l-5.4 -7.1l-4 -3.4l-1.2 -2.1l-1.4 -1.3l-2.6 -5.8l-0.2 -2.9l-2.8 -3.7l-2.6 -5l-1.6 -0.8l-1.2 -4l-4.5 -5l-2.3 -1.9l-0.2 0.5l-0.5 -0.8l2.8 -1.6l-0.7 -0.8l-5.2 -1.9l-2.3 -1.6l-1.4 0.5l0.5 0.5l-1.4 -0.8l-4.7 1.9l-2.6 -0.3l0.9 -1.6l-1.9 0l0.5 0.8l-0.9 0.5l-0.5 1.1l-0.7 -0.5l1.4 -1.3l0 -0.5l-2.3 1.1l-3 -2.4l-0.5 0.8l-0.7 -0.3l-1.6 1.9l1.2 0.8l0 0.5l-1.2 0l-0.5 1.9l-0.9 -0.5l-0.7 -3.2l-1.2 0.5l2.3 -3.5l0.2 -1.1l1.4 0.5l-0.2 -1.9l0.7 -0.5l0.2 -3.2l1.9 -2.7l1.2 -4.5l3 -6.1l-0.5 -5.1l-0.7 -2.4l2.8 -8.8l0.2 -2.9l7 -0.3l10.6 1.6l5.2 -3.2l11.7 -2.4l6.1 -0.3l3.8 -0.8l3 0l10.3 2.9l3.5 2.7z" />
        <path id="tf-kd-northern" class="tf-kd-region" data-region="northern" style="--i:0" d="M261.9 12.9l15.9 3l80 47.3l123.8 102.2l76.9 7l3.3 -0.5l-22.7 9.1l-6.6 3.5l-4.7 4.3l-6.3 8.6l-16.4 31.2l-10.3 12.7l-2.6 7.2l0 2.1l2.3 3.4l-1.9 2.9l-3.3 1.1l-1.9 -1.1l-3.8 -5l-8.9 -7.9l-3.8 -1.9l-15.7 -2.4l-4 -2.9l-1.6 -2.4l-4 -10.4l-8.7 -15.4l-2.3 -1.3l-1.6 0l-9.6 5.3l-3 -0.8l-4.9 -2.7l-3 -0.5l-7.3 0l-2.6 -2.1l-1.2 -3.5l-0.2 -4.5l-1.4 -1.1l-3 0.3l-7.7 3.7l-3.3 -0.3l-5.4 -2.9l-5.6 -6.9l-2.1 -1.6l-19.5 -4.5l-5.2 0.3l-8 1.6l-14.5 -4.3l-5.4 0.3l-26 5.9l-8 -2.9l7.3 -7.8l0.7 -2.1l1.4 -19.1l3 -4.6l5.2 -3.8l39.2 -24.6l6.1 -5.1l0.9 -2.2l-1.2 -2.2l-9.4 -7.6l-4.9 -9.5l-2.1 -2.4l-3 -1.6l-13.6 -1.6l-12 -9l-1.9 -0.5l-7.5 0.5l-25.6 -0.5l-7.3 -2.2l-5.6 -4.6l-33.3 -5.5l-6.1 0l-14.5 2.2l-23 1.9l-5.4 -2.5l-6.1 -10.4l-5.4 -4.1l-1.2 -1.9l-0.7 -6l5.9 -22.8l47.6 -13.8l7.5 -6.4l40.8 6.9z" />
        <path id="tf-kd-jawf" class="tf-kd-region" data-region="jawf" style="--i:1" d="M180.9 73.9l20.9 -1.9l14.5 -2.2l6.1 0l34.5 6l4.5 4.1l7.3 2.2l33.1 0l3.3 1.4l10.6 8.2l13.6 1.6l3 1.6l2.8 3.3l4.2 8.7l10.3 8.7l0 1.9l-2.8 3.5l-4 3l-39.2 24.6l-7.3 6.2l-1.2 3.2l-1.4 19.1l-1.2 2.1l-6.6 6.7l-3 -0.8l-18.8 7.5l-17.4 9.9l-8.2 2.4l-19.9 9.9l-5.2 5.6l-4.5 -2.1l-3 0.8l-7.3 3.2l-2.8 -1.9l-1.4 -3.2l-3.8 -0.3l-2.8 -1.3l-4.2 1.6l-14.1 -1.3l-5.2 -1.9l-6.8 -6.1l-1.6 -5.1l-0.5 -7.7l0.2 -9.9l-1.4 -1.9l-2.1 0.3l-2.8 2.7l-4.2 2.9l-4.5 9.1l-2.3 0.8l-8.2 -0.3l-13.6 -3.7l-3.8 0l-11.3 2.4l-7 2.1l-2.3 -0.8l-13.8 -17.7l-3.3 -1.9l-9.1 -2.4l-3 0l-3.8 0.8l-6.1 0.3l-11.7 2.4l-4 2.9l-1.2 0.3l-18.5 -2.1l1.9 -5.6l-0.5 -2.1l0.9 -2.1l1.6 -7.8l1.4 -1.1l-0.2 -3l0.9 0l-0.5 -1.6l0.2 -0.8l51.4 8.6l20.2 -16.4l12 -19.4l34.7 -7.6l0.9 -0.8l6.8 -16.5l1.6 -1.9l14.5 -8.2l-29.5 -34.4l-18.3 -19.8l48.1 -14.6l-5.9 22.8l0.7 6l1.2 1.9l5.4 4.1l6.1 10.4l3.3 1.9l4.2 0.5z" />
        <path id="tf-kd-bahah" class="tf-kd-region" data-region="bahah" style="--i:9" d="M332.2 612l6.3 -2l6.1 -0.3l6.3 -3.3l2.1 0.5l2.6 2.3l-2.1 9l0.5 1.5l1.6 2l0.2 1.3l-2.3 3.8l-6.6 4.7l-1.2 2.7l-0.2 3.5l-0.7 2.5l-4.7 10.5l-3 0.7l-6.1 0.5l-2.3 3.2l-3 8l-1.9 7.2l-4 1.7l-3.5 -0.7l-4.9 -6l-4.9 -3l-0.7 -3l0 -5.2l-0.9 -4.2l0.7 -5l-1.4 -4l-5.2 -2l-0.9 -1.7l0 -1l5.4 -5.5l9.4 -2.5l1.6 -2l4.7 -9.3l0.2 -3.3l-1.4 -6.3l1.9 -3.8l3 -1.5l3.5 1.8l0.9 1l1.9 5.3l1.9 1.5l1.2 0.3z" />
        <path id="tf-kd-asir" class="tf-kd-region" data-region="asir" style="--i:10" d="M472.2 664.7l0 8l-1.6 2.2l-4.2 2.7l-1.2 1.7l-0.2 2.5l1.9 8.7l-0.5 5l-2.8 4l-4 2.5l-6.6 1.7l-2.8 3.2l-2.1 4.5l-6.8 5.9l-8.7 9.6l-1.4 3.2l1.6 7.6l-1.6 16.3l1.2 4.2l0 2.7l-1.2 6.4l-3 -2.2l-6.6 -2l-4.5 2.2l-4.7 -7.1l-5.4 -2.7l-2.8 -5.2l-4.7 -3.9l-1.2 -2.5l0 -3.2l-0.7 -0.7l-2.1 -0.2l-5.2 3.7l-1.6 3l-3 9.6l-1.9 0.5l-2.3 -1.2l-5.2 -5.7l-1.4 -3.2l-3.3 -2l-7.5 0l-2.1 -1l-3 -5.2l-3.3 -1.2l-4 0.2l-0.9 -0.7l-0.5 -3.7l1.2 -5.9l-0.7 -2.5l-1.9 -0.5l-5.4 0.2l1.9 -8.9l-4 -12.1l-2.8 -1.7l-10.1 -0.7l-2.6 -3.5l-0.5 -3l0.7 -12.9l2.6 1.5l1.9 -0.5l5.4 -3.5l9.6 0l1.9 -2.5l1.6 -6.5l-2.8 -6.7l1.6 -9.7l-2.1 -3.5l-3.5 -0.2l-2.1 1l4.7 -10.5l1.4 -7.2l0.7 -1.5l7.5 -5.7l1.4 -2.8l-0.7 -2l-1.2 -1.3l-0.5 -2.8l2.1 -7.8l6.6 12.3l2.8 1.8l3 -0.5l4 -2.8l12 -10.8l10.6 -6l3 -2.8l7.5 -1.3l4.5 -1.8l4.5 0l4.5 1l1.6 -0.5l7.3 -4.5l5.2 -1.8l6.8 6l6.8 9.3l4 4.3l0.9 4.3l-4.5 8.3l-1.9 9.7l0.2 1.7l3.5 4.2l4.5 7.7l19.2 17.4z" />
        <path id="tf-kd-jazan" class="tf-kd-region" data-region="jazan" style="--i:12" d="M349.6 801.2l1.9 0l1.6 1l1.6 -0.5l0.7 1.2l1.9 -0.7l-1.4 -0.2l-0.7 -1l1.9 -2.9l2.1 1.2l0.7 1.7l-0.2 0.5l1.2 0.2l0.5 1l1.6 0.7l-0.2 3.4l0.5 1.5l-0.5 1l-1.2 0l-1.2 -1.5l-2.6 -1l2.1 -1.2l-0.5 -1l-1.2 -0.7l-3.5 0.5l-1.6 1l-6.1 -3.9l-0.7 -1l-0.2 -1.7l-2.1 -1l-1.2 -3.7l3.5 1.7l1.4 2l0.2 1.7l1.6 1.7zM351.7 791.9l0 2.7l1.4 0.5l0.5 1l-1.9 0l-0.7 0.7l0.5 1l2.6 1.2l0.2 1.7l-3.8 -1.5l-4 -4.9l4.2 -2.2l0.2 -1l-0.5 -1.2l-3.5 -1l0.7 -0.7l3.8 2.2l0.2 1.5zM351.7 737.3l6.1 0.2l2.3 2l0.9 2.7l0.9 1.2l2.1 1l8.4 0.2l2.3 1.7l2.3 4.4l5.4 5.2l2.1 0.5l1.9 -2l2.1 -8.1l2.6 -3.9l4.5 -2.7l1.9 0.2l0.9 1.7l0 3.2l0.9 1.5l4.7 3.9l2.8 5.2l5.4 2.7l4.7 7.1l-5.9 4.7l-2.3 2.9l3.5 1.5l0.5 2.2l-4.5 2l-1.6 6.9l0.7 2.9l-1.2 4.2l2.1 4.9l2.3 0.7l0.2 1.7l-1.2 0.7l-0.7 1.7l0.7 2l-0.2 1l-0.7 0.2l-3 -1l-0.7 0.2l-1.6 5.9l-1.6 1.7l-2.8 1.5l-2.3 0.5l-0.2 2.9l-5.2 2.2l0 -1.7l-0.5 -0.5l0.7 -1.7l-3 -4.4l-0.2 -3.2l0.7 -2.2l-0.2 -0.7l-0.7 -0.2l0.2 -0.5l-1.2 -2l0.5 -0.2l-3.8 -4.4l-2.1 -1l-0.5 0.5l-1.6 -2.5l0.7 -2l-0.5 -4.2l-0.9 -0.5l-0.5 -1l-2.6 -0.2l-2.8 -6.1l-2.1 -0.7l1.4 2.9l-0.9 0.5l0.5 3.2l-0.5 1l-0.5 -1l0 -4.4l-2.1 -10.6l0 -4.7l-7.7 -6.4l-0.2 0.2l-2.6 -4.2l-1.4 0l-2.6 -3l-0.9 0.2l-5.2 -5.4l-0.9 0.5l-1.9 -1.2l-0.9 0l-0.5 -1.2l-4.9 -4.9l0 -2.5l-1.2 -0.7l0 -0.7l-2.6 -2.7l0.5 -1l-0.5 -0.2l2.1 -3.7l5.2 -4l0.9 -2l5.4 -0.2l1.9 0.5l0.7 2.5l-1.2 7.2l0.5 2.5l0.9 0.7z" />
        <path id="tf-kd-makkah" class="tf-kd-region" data-region="makkah" style="--i:8" d="M353.5 440.7l-0.5 4.9l0.5 4.4l4.9 3.8l4.9 13.8l1.4 7.2l7 16.1l4 2l19.2 1l4.5 1.5l1.9 2l0 2l-0.7 2.3l-0.2 6.4l1.4 3.3l4 2.3l2.3 0l7.5 -1.8l7.5 2l0.7 0.8l-1.2 9.6l2.3 18l-1.6 4l-2.3 3.8l0.2 11.6l-1.9 9.6l0.7 2l12.4 18.4l-5.2 1.8l-7.3 4.5l-3 0.5l-5.6 -1.3l-8 2.3l-5.9 1l-4.2 3.8l-9.4 5l-13.6 12l-4 2l-2.3 -0.3l-2.6 -2.5l-5.9 -11.3l-2.6 -2.3l-2.1 -0.5l-7.3 3.5l-8 0.5l-3.5 1.5l-1.6 -0.3l-1.9 -2.5l-1.4 -4.3l-3.3 -2.5l-2.3 0l-3.3 3.3l-0.5 1.8l1.4 8.3l-0.2 1.3l-5.2 10.3l-3.3 1.7l-7.3 1.7l-5.4 5.5l0.2 2l1.6 1.2l4.2 1.5l1.4 4l-0.7 5l1.2 5.5l0 6l1.6 2.2l3.8 1.7l4.9 6l3.5 0.7l4 -1.7l0.9 -1.7l0.9 -5.5l3 -8l2.3 -3.2l7.7 -0.7l3.5 -1.5l3.5 0.2l1.9 2.5l0.2 3l-1.6 7.7l0.5 2.2l2.3 4.5l-2.1 7.5l-1.4 1.5l-2.3 0.5l-7.3 -0.5l-6.3 4l-3.5 -1.5l-0.5 1.2l0.2 14.6l1.6 3l1.9 0.7l7.3 0l3.8 1.2l1.4 1.7l3.5 11.4l-0.2 2.7l-3 8.9l-5.9 4.7l-0.9 2.2l-1.9 -2.7l0.2 -0.7l-1.4 -0.7l-0.5 -1.2l-1.2 0.2l0.2 -2.7l-1.4 0l-1.9 -9.6l-0.7 -0.2l-0.2 -1.2l-1.9 -1.5l-0.7 -1.7l-1.2 -1l-1.6 0.7l-1.4 -1.2l-2.6 -5.4l1.9 -6.2l-1.9 -1.2l-1.9 -0.5l-0.5 -2l-1.2 -1.7l1.9 -6l-1.2 -1.5l-3.8 -1.5l-1.4 -3.5l0.5 -1.5l-0.7 -2l-3.5 -4l-0.7 -4.7l0.7 -0.7l-0.5 -0.5l-0.2 -2l-5.2 -2l-3.5 -3.5l1.6 0.7l0.2 -4.5l-2.6 -4.2l-0.9 -0.7l-3.3 -0.2l-0.5 0.5l0.5 1.2l-4.2 -6.2l-1.9 -1.2l0.7 -1.7l-0.7 -1.2l-3.8 -2l-2.8 -3l-3.3 -1l-4 -3.7l0.5 -0.7l-3.8 -1.2l-4.2 -4l-3.3 0.5l-0.5 0.5l-4 -2.3l1.6 2.5l-8.4 -4.5l-0.7 -1.5l-4.7 -4l-3.8 -5.8l1.2 -0.3l0.2 -0.5l-1.4 -0.5l-1.4 -1.5l-0.5 -2l-1.4 -1.8l-0.2 -1l0.7 -1l-2.1 -0.8l0.5 1l-1.6 -0.8l-0.5 -0.8l0.2 -0.8l-0.7 -0.8l0.5 -0.8l0.9 1l0.7 0l-0.7 -1.8l-1.6 -0.8l0 0.8l-3.3 -2.8l0.2 -1l0.7 0.5l-0.2 -1.3l-2.8 -0.5l-1.6 -2.8l-0.2 -2.5l-0.7 -0.3l-0.5 -1.5l-2.6 -2l-0.7 -3.3l0.5 -0.8l-4.2 -6.3l3.8 -3.3l0.5 -2.8l-0.9 -2.5l0.5 -1.3l-0.7 -1.5l-1.2 1.3l-0.9 -1.8l0.5 -0.3l-0.9 -1l0 -4.5l-0.7 -1.3l1.6 -2l-0.5 -1.5l-0.9 1.8l-0.7 -0.3l-5.4 -9.6l-0.9 -4.3l0.2 -1l1.2 -0.5l1.2 1.8l0.9 0l0.5 -3l0.9 -0.5l0.2 -4.1l-0.7 1.8l0.7 -6.1l1.6 -1.8l0.7 -2.8l0.9 -0.8l0.5 -1.5l1.2 -1l-0.7 -1.5l-0.7 0l-0.9 2.5l-1.2 0.3l0.5 -3.6l-0.2 -7.1l-4.2 -7.6l1.4 -2l-3.3 -3.3l-0.5 0.3l2.1 3.6l-0.5 0.5l-5.6 -9.4l0 -0.8l1.4 0.8l1.6 3.6l1.6 0.5l0.7 -1l-3.3 -4.8l-3.8 -1l-1.6 -2.8l1.2 -2.8l-0.2 -2.8l-0.7 -0.3l-0.2 0.8l-3.3 -4.8l-3 -8.4l0 -1l7.3 -0.5l4.7 -1l2.1 1.3l2.6 3.8l9.6 9.4l9.8 -0.8l1.4 1.3l0.9 3.8l0.9 0.5l3.8 -0.5l9.8 -3.3l6.6 0l1.4 1.5l0.5 3.6l-0.7 3.3l-2.8 7.1l0.9 1.8l6.3 2.8l2.3 4.8l-0.9 5.3l0.7 1.8l1.2 0.8l6.6 0l7.7 -5.8l2.6 -0.3l8.2 2.3l2.3 -1.8l3.3 -5.3l1.9 -2l13.4 -10.7l9.4 -8.7l6.6 -2.6l1.4 -2.3l-1.2 -2l-7 -4.3l-0.2 -1.3l0.5 -1.3l3.5 -3.1l6.1 -3.3l8.4 -3.6l2.3 -2l2.1 -4.6l-0.2 -4.4l-1.4 -4.6l1.9 -2.6l0.9 -0.5l9.1 0.8z" />
        </g>

        <!-- Cursor light, clipped to the Kingdom so it never spills onto the page. -->
        <g class="tf-kd-cursor" clip-path="url(#tf-kd-clip)">
        <circle class="tf-kd-orb" r="175" fill="url(#tf-kd-orb-grad)" />
        </g>

        <g class="tf-kd-net">
        <path class="tf-kd-link" d="M573.5 401.4Q381.6 448.6 222.6 566" />
        <path class="tf-kd-link" d="M573.5 401.4Q664.6 376.3 734.3 312.6" />
        <path class="tf-kd-link" d="M573.5 401.4Q406.7 374.6 242.4 414" />
        <path class="tf-kd-link" d="M573.5 401.4Q469.8 307.3 339.7 255.2" />
        <path class="tf-kd-link" d="M573.5 401.4Q477.4 571.1 454 764.8" />
        <path class="tf-kd-link" d="M222.6 566Q282.5 663.9 378 727.6" />
        <path class="tf-kd-link" d="M222.6 566Q236.7 577.8 253.8 570.9" />
        <path class="tf-kd-link" d="M242.4 414Q191.2 297.1 98.9 208.9" />
        <path class="tf-kd-link" d="M378 727.6Q364.4 761.5 380.1 794.4" />
        <path class="tf-kd-link" d="M339.7 255.2Q318 182.5 270.1 123.7" />
        <path class="tf-kd-link" d="M734.3 312.6Q590.1 286.4 446.8 317.6" />
        <path class="tf-kd-pulse" style="--p:0" pathLength="100" d="M573.5 401.4Q381.6 448.6 222.6 566" />
        <path class="tf-kd-pulse" style="--p:1" pathLength="100" d="M573.5 401.4Q664.6 376.3 734.3 312.6" />
        <path class="tf-kd-pulse" style="--p:2" pathLength="100" d="M573.5 401.4Q406.7 374.6 242.4 414" />
        <path class="tf-kd-pulse" style="--p:3" pathLength="100" d="M573.5 401.4Q477.4 571.1 454 764.8" />
        <path class="tf-kd-pulse" style="--p:4" pathLength="100" d="M222.6 566Q282.5 663.9 378 727.6" />
        <path class="tf-kd-pulse" style="--p:5" pathLength="100" d="M242.4 414Q191.2 297.1 98.9 208.9" />
        <path class="tf-kd-pulse" style="--p:6" pathLength="100" d="M339.7 255.2Q318 182.5 270.1 123.7" />
        </g>

        <path id="tf-kd-border" class="tf-kd-outline" pathLength="100" d="M608.9 784.3l-12.7 7.4l-8.9 -0.5l-10.6 -14.7l-1.6 -1l-18.1 2.5l-42 -4.2l-2.1 -0.7l-7.7 -4.4l-2.6 -0.7l-25.3 0.2l-4.2 1l-6.1 -0.7l-9.1 1.5l-2.8 -0.7l-2.1 2.7l-2.1 0.2l-2.6 -1.2l-1.9 1.5l-1.2 1.7l-2.1 -0.2l0 -2l-7.7 0l-5.2 -5.4l-5.4 -2.7l-4.2 -0.2l-5.2 3l-4.2 3.7l-2.3 2.9l3.5 1.5l0.5 2.2l-4.5 2l-1.6 6.9l0.7 2.9l-1.2 4.2l2.1 4.9l2.3 0.7l0.2 1.7l-1.2 0.7l-0.7 1.7l0.7 2l-0.2 1l-0.7 0.2l-3 -1l-0.7 0.2l-1.6 5.9l-1.6 1.7l-2.8 1.5l-2.3 0.5l-0.2 2.9l-5.2 2.2l0 -1.7l-0.5 -0.5l0.7 -1.7l-3 -4.4l-0.2 -3.2l0.7 -2.2l-0.2 -0.7l-0.7 -0.2l0.2 -0.5l-1.2 -2l0.5 -0.2l-3.8 -4.4l-2.1 -1l-0.5 0.5l-1.6 -2.5l0.7 -2l-0.5 -4.2l-0.9 -0.5l-0.5 -1l-2.6 -0.2l-2.8 -6.1l-2.1 -0.7l1.4 2.9l-0.9 0.5l0.5 3.2l-0.5 1l-0.5 -1l0 -4.4l-2.1 -10.6l0 -4.7l-7.7 -6.4l-0.2 0.2l-2.6 -4.2l-1.4 0l-2.6 -3l-0.9 0.2l-5.2 -5.4l-0.9 0.5l-1.9 -1.2l-0.9 0l-0.5 -1.2l-4.9 -4.9l0 -2.5l-1.2 -0.7l0 -0.7l-2.6 -2.7l0.5 -1l-2.3 -3l0.2 -0.7l-1.4 -0.7l-0.5 -1.2l-1.2 0.2l0.2 -2.7l-1.4 0l-1.9 -9.6l-0.7 -0.2l-0.2 -1.2l-1.9 -1.5l-0.7 -1.7l-1.2 -1l-1.6 0.7l-1.4 -1.2l-2.6 -5.4l1.9 -6.2l-1.9 -1.2l-1.9 -0.5l-0.5 -2l-1.2 -1.7l1.9 -6l-1.2 -1.5l-3.8 -1.5l-1.4 -3.5l0.5 -1.5l-0.7 -2l-3.5 -4l-0.7 -4.7l0.7 -0.7l-0.5 -0.5l-0.2 -2l-5.2 -2l-3.5 -3.5l1.6 0.7l0.2 -4.5l-2.6 -4.2l-0.9 -0.7l-3.3 -0.2l-0.5 0.5l0.5 1.2l-4.2 -6.2l-1.9 -1.2l0.7 -1.7l-0.7 -1.2l-3.8 -2l-2.8 -3l-3.3 -1l-4 -3.7l0.5 -0.7l-3.8 -1.2l-4.2 -4l-3.3 0.5l-0.5 0.5l-4 -2.3l1.6 2.5l-8.4 -4.5l-0.7 -1.5l-4.7 -4l-3.8 -5.8l1.2 -0.3l0.2 -0.5l-1.4 -0.5l-1.4 -1.5l-0.5 -2l-1.4 -1.8l-0.2 -1l0.7 -1l-2.1 -0.8l0.5 1l-1.6 -0.8l-0.5 -0.8l0.2 -0.8l-0.7 -0.8l0.5 -0.8l0.9 1l0.7 0l-0.7 -1.8l-1.6 -0.8l0 0.8l-3.3 -2.8l0.2 -1l0.7 0.5l-0.2 -1.3l-2.8 -0.5l-1.6 -2.8l-0.2 -2.5l-0.7 -0.3l-0.5 -1.5l-2.6 -2l-0.7 -3.3l0.5 -0.8l-4.2 -6.3l3.8 -3.3l0.5 -2.8l-0.9 -2.5l0.5 -1.3l-0.7 -1.5l-1.2 1.3l-0.9 -1.8l0.5 -0.3l-0.9 -1l0 -4.5l-0.7 -1.3l1.6 -2l-0.5 -1.5l-0.9 1.8l-0.7 -0.3l-5.4 -9.6l-0.9 -4.3l0.2 -1l1.2 -0.5l1.2 1.8l0.9 0l0.5 -3l0.9 -0.5l0.2 -4.1l-0.7 1.8l0.7 -6.1l1.6 -1.8l0.7 -2.8l0.9 -0.8l0.5 -1.5l1.2 -1l-0.7 -1.5l-0.7 0l-0.9 2.5l-1.2 0.3l0.5 -3.6l-0.2 -7.1l-4.2 -7.6l1.4 -2l-3.3 -3.3l-0.5 0.3l2.1 3.6l-0.5 0.5l-5.6 -9.4l0 -0.8l1.4 0.8l1.6 3.6l1.6 0.5l0.7 -1l-3.3 -4.8l-3.8 -1l-1.6 -2.8l1.2 -2.8l-0.2 -2.8l-0.7 -0.3l-0.2 0.8l-3.3 -4.8l-3 -8.4l-0.7 -5.6l-1.4 -2l0 -1l-0.9 0.8l-0.9 -0.3l0.5 1.3l1.2 0.3l0 0.5l-1.6 -0.3l-0.9 -1l0 -2.3l-2.1 -2.8l-1.9 -7.2l-3 -2.1l-1.2 -2.3l-2.6 -1.3l-2.3 -2.6l-3.5 -1.5l-5.6 -5.1l-0.9 0.5l-5.2 -3.9l1.2 -1l1.2 -0.3l-0.5 -0.5l-1.6 0.8l-0.5 -0.8l0.9 -1.5l-1.4 0.3l0 2.6l-2.6 0l-8.9 -7.2l-1.6 0l-0.7 1l0.2 1l-2.1 0.3l-1.9 -1.5l-0.9 0.3l-2.8 -3.6l-1.6 -1.3l-0.5 -1.8l0.7 -1l0.9 0.8l0.5 -1l-11 -16.2l-0.5 -3.4l-1.2 0.8l-1.4 -1.3l-0.7 -1.8l3.3 0.3l1.6 -1.3l0.2 -2.6l0.9 -2.3l-1.4 -4.7l0.5 -2.8l-1.4 -4.4l-5.9 -6.5l-1.2 -3.9l-0.9 -1.3l0.7 -0.5l-0.5 -1.3l-2.6 -2.6l-0.9 -2.6l-3 -5.2l-2.1 -1l-3 -4.4l-0.9 0l0.5 1.8l-1.2 0l-4 -3.6l0 -1.6l-0.9 -0.3l-0.7 -2.6l2.1 -3.4l0 -2.9l-1.6 -2.3l-3 -1.3l-3.3 -0.5l-5.2 -10.5l-1.9 -2.9l-3.5 -8.6l-3.8 -6.6l-6.1 -6.8l-2.3 -4.7l-0.9 -3.2l-0.7 0.3l-1.9 -2.6l-3 -2.6l-3.8 -5l-1.4 -4l0.7 -1.1l-5.4 -7.1l-4 -3.4l-1.2 -2.1l-1.4 -1.3l-2.6 -5.8l-0.2 -2.9l-2.8 -3.7l-2.6 -5l-1.6 -0.8l-1.2 -4l-4.5 -5l-2.3 -1.9l-0.2 0.5l-0.5 -0.8l2.8 -1.6l-0.7 -0.8l-5.2 -1.9l-2.3 -1.6l-1.4 0.5l0.5 0.5l-1.4 -0.8l-4.7 1.9l-2.6 -0.3l0.9 -1.6l-1.9 0l0.5 0.8l-0.9 0.5l-0.5 1.1l-0.7 -0.5l1.4 -1.3l0 -0.5l-2.3 1.1l-3 -2.4l-0.5 0.8l-0.7 -0.3l-1.6 1.9l1.2 0.8l0 0.5l-1.2 0l-0.5 1.9l-0.9 -0.5l-0.7 -3.2l-1.2 0.5l2.3 -3.5l0.2 -1.1l1.4 0.5l-0.2 -1.9l0.7 -0.5l0.2 -3.2l1.9 -2.7l1.2 -4.5l3 -6.1l-0.5 -5.1l-0.7 -2.4l2.8 -8.8l0 -3.2l-0.7 -0.5l1.9 -5.6l-0.5 -2.1l0.9 -2.1l1.6 -7.8l1.4 -1.1l-0.2 -3l0.9 0l-0.5 -1.6l0.2 -0.8l51.4 8.6l20.2 -16.4l12 -19.4l34.7 -7.6l0.9 -0.8l6.8 -16.5l1.6 -1.9l14.5 -8.2l-29.5 -34.4l-18.3 -19.8l95.7 -28.4l7.5 -6.4l56.8 10l80 47.3l123.8 102.2l76.9 7l8.2 -1.6l42.4 5.4l2.8 4.8l2.8 8.6l1.2 6.1l3.8 3.7l0.5 1.3l35.9 -0.3l3 2.4l0.5 4.3l-0.5 1.1l1.2 -1.1l0.5 0.8l-0.9 3.2l0.9 2.1l4.2 5.1l-1.2 2.9l2.6 5.3l-0.2 0.3l6.6 2.7l-2.3 1.1l6.8 8l-1.4 4.8l-0.7 0.3l0.5 -1.1l0.2 -3.7l-2.3 3.4l0.9 -2.9l-0.5 -1.1l-1.6 6.1l1.4 -1.6l0.2 2.9l0.9 -0.3l0.2 -0.8l0.2 2.4l1.4 -0.5l-0.2 1.9l-0.5 0l0.7 1.6l-1.6 -0.8l-0.5 0.8l1.9 0.3l1.4 -1.6l0.2 0.8l-0.7 1.6l0.2 1.1l0.9 0l-0.5 -1.6l3 -1.1l2.1 1.9l1.9 0.8l0.5 0.8l-0.9 0.5l1.6 0l-0.5 -0.8l1.6 0.8l2.3 0l1.2 -0.8l2.8 0.8l3.3 3.7l0.2 1.3l-1.2 -0.5l-0.2 -0.8l-0.9 1.1l-2.6 -0.3l-1.4 1.1l-0.2 -1.1l-2.6 1.1l4.5 2.4l1.4 -1.6l0.9 0.5l-1.9 2.4l0 2.1l2.6 -1.6l1.6 0.8l-0.5 1.1l0.7 3.2l-0.2 2.1l0.5 1.1l0.7 -0.3l0.2 1.3l0.9 -0.5l-0.2 -0.8l1.2 -0.5l1.2 0.8l-0.9 2.4l-1.2 0l1.9 1.3l1.6 -1.3l-0.5 0.8l4.5 0.5l-1.6 -2.1l1.2 -0.8l1.9 0.8l0.7 -1.1l-0.5 2.9l0.7 2.1l6.3 7.9l5.9 3.2l1.6 1.6l3.3 0l2.8 2.4l3.3 4.5l4.2 3.4l0 1.3l-3 -2.6l-3.3 -0.5l-0.9 -2.6l-0.9 3.9l0.9 1.3l0 4.2l1.6 4.7l1.6 1.3l5.4 2.6l0.9 1.8l0 9.4l-0.5 1l-0.9 0.5l-0.2 -1l-0.9 0.8l0.2 3.4l-0.9 3.4l-0.9 -1.3l-0.2 -2.3l-1.9 -1.3l-0.7 -2.9l-1.9 -0.8l-2.1 3.1l0.9 3.7l-0.2 3.7l0.7 0.3l1.2 -1.3l-0.2 -0.8l1.9 1l0.5 1l1.2 0.3l1.4 2.9l-0.9 1l1.4 5.2l4.9 7l0.2 2.6l-0.7 -2.6l-4.2 -2.9l-0.2 1l1.9 2.1l0.7 -0.5l1.9 3.6l6.6 8.1l-0.7 -2.3l1.2 -0.3l1.2 2.3l2.6 1l2.8 8.6l0.5 4.1l0.7 2.1l-0.2 2.1l0.7 3.4l0.7 0.5l0.2 -0.8l3.8 4.1l0.9 3.4l2.1 1.8l0.7 5.7l1.4 2.3l0.7 0l1.2 -1l3.3 5.7l2.3 2.6l5.2 1.3l2.6 0l2.3 -0.8l3.3 -2.6l3 0.3l1.2 0.8l-0.7 1.8l0.5 0.8l0 2.1l1.6 -0.8l1.9 -3.1l0.7 -0.3l0.2 -1.8l2.3 0.5l0.5 1.3l2.1 0.5l0 0.5l-2.6 1l-2.3 3.4l-4.2 4.4l-0.5 3.1l-0.7 0.3l0 1.8l6.3 -1l3.8 1.3l1.4 1.5l2.1 0.8l0.5 8l46 59.3l119.4 16.3l0.7 -0.3l3 -4.1l21.3 36.8l-31 99.7l-140.7 49.8l-133.7 19.1l-6.6 2.5l-38.9 20.3l-26.7 33.7l-6.1 16.5l-1.4 1.7" />
        <path class="tf-kd-isles" d="M349.6 801.2l1.9 0l1.6 1l1.6 -0.5l0.7 1.2l1.9 -0.7l-1.4 -0.2l-0.7 -1l1.9 -2.9l2.1 1.2l0.7 1.7l-0.2 0.5l1.2 0.2l0.5 1l1.6 0.7l-0.2 3.4l0.5 1.5l-0.5 1l-1.2 0l-1.2 -1.5l-2.6 -1l2.1 -1.2l-0.5 -1l-1.2 -0.7l-3.5 0.5l-1.6 1l-6.1 -3.9l-0.7 -1l-0.2 -1.7l-2.1 -1l-1.2 -3.7l3.5 1.7l1.4 2l0.2 1.7l1.6 1.7M351.7 791.9l0 2.7l1.4 0.5l0.5 1l-1.9 0l-0.7 0.7l0.5 1l2.6 1.2l0.2 1.7l-3.8 -1.5l-4 -4.9l4.2 -2.2l0.2 -1l-0.5 -1.2l-3.5 -1l0.7 -0.7l3.8 2.2l0.2 1.5M99.6 354.2l1.9 1.8l3.5 1l-0.7 1l-5.9 -2.9l-0.2 0.8l-2.3 -2.9l2.6 -3.1l-0.9 2.6l2.1 1.6M709.1 263.8l5.9 1.6l-0.9 0.5l-2.1 -0.8l-2.8 1.3l-1.2 -0.5l0 -1.6l-2.3 0.3l-1.6 2.4l0 -1.3l0.7 -1.3l1.4 -1.1l2.3 0l0.7 0.5M106.8 357.3l2.6 1.8l0.2 0.8l4.7 3.1l-0.5 0.5l-2.8 -2.3l-2.1 -0.8l-0.2 -1l-2.1 -1.6l-1.9 0.5l0.5 -1l1.6 0M111.5 362.8l4.5 2.1l-0.9 0l-0.2 0.8l0.9 0.5l1.2 -1.3l0.9 0.3l-2.8 2.9l-4.9 -4.9l-0.9 -2.1l2.3 1.8M100.5 349.5l0.9 0.3l-0.7 0.8l-2.3 -1.8l-0.2 -3.6l1.2 -1.8l-0.5 2.1l2.1 1.8l-0.5 2.3M119.7 362.2l0.7 1l0.5 2.6l-1.2 -1.6l-0.9 0.3l-0.9 -1.3l-0.7 0.5l0.7 -2.1l1.9 0.5" />

        <!-- The hovered region is re-drawn on top of the border so its own outline
        is never clipped by a neighbour painted after it. -->
        <g class="tf-kd-lift">
        <use href="#tf-kd-najran" data-for="najran" [class.is-lit]="active() === 'najran'" pointer-events="none" />
        <use href="#tf-kd-riyadh" data-for="riyadh" [class.is-lit]="active() === 'riyadh'" pointer-events="none" />
        <use href="#tf-kd-eastern" data-for="eastern" [class.is-lit]="active() === 'eastern'" pointer-events="none" />
        <use href="#tf-kd-madinah" data-for="madinah" [class.is-lit]="active() === 'madinah'" pointer-events="none" />
        <use href="#tf-kd-qassim" data-for="qassim" [class.is-lit]="active() === 'qassim'" pointer-events="none" />
        <use href="#tf-kd-hail" data-for="hail" [class.is-lit]="active() === 'hail'" pointer-events="none" />
        <use href="#tf-kd-tabuk" data-for="tabuk" [class.is-lit]="active() === 'tabuk'" pointer-events="none" />
        <use href="#tf-kd-northern" data-for="northern" [class.is-lit]="active() === 'northern'" pointer-events="none" />
        <use href="#tf-kd-jawf" data-for="jawf" [class.is-lit]="active() === 'jawf'" pointer-events="none" />
        <use href="#tf-kd-bahah" data-for="bahah" [class.is-lit]="active() === 'bahah'" pointer-events="none" />
        <use href="#tf-kd-asir" data-for="asir" [class.is-lit]="active() === 'asir'" pointer-events="none" />
        <use href="#tf-kd-jazan" data-for="jazan" [class.is-lit]="active() === 'jazan'" pointer-events="none" />
        <use href="#tf-kd-makkah" data-for="makkah" [class.is-lit]="active() === 'makkah'" pointer-events="none" />
        </g>

        <g class="tf-kd-nodes">
        <g class="tf-kd-node" data-region="riyadh" [class.is-lit]="active() === 'riyadh'" style="--i:0;--b:6.5s;--d:0.0s" transform="translate(573.5 401.4)"><circle class="tf-kd-node-halo" r="9" /><circle class="tf-kd-node-core" r="2.1" /></g>
        <g class="tf-kd-node" data-region="makkah" [class.is-lit]="active() === 'makkah'" style="--i:1;--b:7.8s;--d:0.7s" transform="translate(222.6 566)"><circle class="tf-kd-node-halo" r="9" /><circle class="tf-kd-node-core" r="2.1" /></g>
        <g class="tf-kd-node" data-region="eastern" [class.is-lit]="active() === 'eastern'" style="--i:2;--b:9.1s;--d:1.4s" transform="translate(734.3 312.6)"><circle class="tf-kd-node-halo" r="9" /><circle class="tf-kd-node-core" r="2.1" /></g>
        <g class="tf-kd-node" data-region="madinah" [class.is-lit]="active() === 'madinah'" style="--i:3;--b:10.4s;--d:2.1s" transform="translate(242.4 414)"><circle class="tf-kd-node-halo" r="9" /><circle class="tf-kd-node-core" r="2.1" /></g>
        <g class="tf-kd-node" data-region="makkah" [class.is-lit]="active() === 'makkah'" style="--i:4;--b:11.7s;--d:2.8s" transform="translate(253.8 570.9)"><circle class="tf-kd-node-halo" r="9" /><circle class="tf-kd-node-core" r="2.1" /></g>
        <g class="tf-kd-node" data-region="tabuk" [class.is-lit]="active() === 'tabuk'" style="--i:5;--b:6.5s;--d:3.5s" transform="translate(98.9 208.9)"><circle class="tf-kd-node-halo" r="9" /><circle class="tf-kd-node-core" r="2.1" /></g>
        <g class="tf-kd-node" data-region="asir" [class.is-lit]="active() === 'asir'" style="--i:6;--b:7.8s;--d:4.2s" transform="translate(378 727.6)"><circle class="tf-kd-node-halo" r="9" /><circle class="tf-kd-node-core" r="2.1" /></g>
        <g class="tf-kd-node" data-region="jazan" [class.is-lit]="active() === 'jazan'" style="--i:7;--b:9.1s;--d:4.9s" transform="translate(380.1 794.4)"><circle class="tf-kd-node-halo" r="9" /><circle class="tf-kd-node-core" r="2.1" /></g>
        <g class="tf-kd-node" data-region="hail" [class.is-lit]="active() === 'hail'" style="--i:8;--b:10.4s;--d:5.6s" transform="translate(339.7 255.2)"><circle class="tf-kd-node-halo" r="9" /><circle class="tf-kd-node-core" r="2.1" /></g>
        <g class="tf-kd-node" data-region="qassim" [class.is-lit]="active() === 'qassim'" style="--i:9;--b:11.7s;--d:6.3s" transform="translate(446.8 317.6)"><circle class="tf-kd-node-halo" r="9" /><circle class="tf-kd-node-core" r="2.1" /></g>
        <g class="tf-kd-node" data-region="jawf" [class.is-lit]="active() === 'jawf'" style="--i:10;--b:6.5s;--d:7.0s" transform="translate(270.1 123.7)"><circle class="tf-kd-node-halo" r="9" /><circle class="tf-kd-node-core" r="2.1" /></g>
        <g class="tf-kd-node" data-region="northern" [class.is-lit]="active() === 'northern'" style="--i:11;--b:7.8s;--d:7.7s" transform="translate(308.4 69)"><circle class="tf-kd-node-halo" r="9" /><circle class="tf-kd-node-core" r="2.1" /></g>
        <g class="tf-kd-node" data-region="najran" [class.is-lit]="active() === 'najran'" style="--i:12;--b:9.1s;--d:8.4s" transform="translate(454 764.8)"><circle class="tf-kd-node-halo" r="9" /><circle class="tf-kd-node-core" r="2.1" /></g>
        <g class="tf-kd-node" data-region="bahah" [class.is-lit]="active() === 'bahah'" style="--i:13;--b:10.4s;--d:9.1s" transform="translate(329.3 639.9)"><circle class="tf-kd-node-halo" r="9" /><circle class="tf-kd-node-core" r="2.1" /></g>
        </g>
        </svg>
      <span class="tf-kingdom-tip" data-kingdom-tip aria-hidden="true">{{ tip() }}</span>
    </div>
  `,
  styles: `:host { display: contents; }`
})
export class KingdomMapComponent {
  private readonly locale = inject(LocaleService);
  private readonly motion = inject(ReducedMotion);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly label = input.required<string>();

  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private touchTimer: ReturnType<typeof setTimeout> | undefined;

  /** The region under the pointer, as a `data-region` key. */
  readonly active = signal('');
  /** The entrance plays once, when the map first comes into view. */
  readonly entered = signal(false);

  readonly tip = computed(() => {
    const pair = REGION_NAMES[this.active()];
    return pair ? pair[this.locale.lang() === 'ar' ? 1 : 0] : '';
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.touchTimer));

    effect(onCleanup => {
      if (this.entered()) return;
      // Reduced motion, and every environment without an observer, gets the map
      // already arrived rather than never arriving.
      if (!this.isBrowser || this.motion.preferred()
          || !('IntersectionObserver' in (this.document.defaultView ?? {}))) {
        this.entered.set(true);
        return;
      }
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) this.entered.set(true);
      }, { threshold: ENTRANCE_RATIO });
      observer.observe(this.stage().nativeElement);
      onCleanup(() => observer.disconnect());
    });
  }

  hover(event: PointerEvent): void {
    this.active.set(this.regionOf(event.target));
  }

  track(event: PointerEvent): void {
    this.active.set(this.regionOf(event.target));
    if (this.motion.preferred()) return;
    this.paintCursor(event.clientX, event.clientY);
  }

  leave(event: PointerEvent): void {
    // A touch pointer leaves the moment the finger lifts. Clearing on that would
    // undo the tap highlight before it was ever seen; touch is handed back by
    // its own timer instead.
    if (event.pointerType && event.pointerType !== 'mouse') return;
    clearTimeout(this.touchTimer);
    this.active.set('');
  }

  tap(event: PointerEvent): void {
    if (event.pointerType === 'mouse') return;
    const region = this.regionOf(event.target);
    if (!region) return;
    this.active.set(region);
    clearTimeout(this.touchTimer);
    this.touchTimer = setTimeout(() => this.active.set(''), TOUCH_HOLD_MS);
  }

  /**
   * A hit that lands inside a `<use>` is retargeted to the `<use>` itself, so it
   * can arrive carrying either attribute. Both name the same region.
   */
  private regionOf(target: EventTarget | null): string {
    const element = target as Element | null;
    const host = element?.closest?.('[data-region],[data-for]');
    return host?.getAttribute('data-region') ?? host?.getAttribute('data-for') ?? '';
  }

  /**
   * The cursor light is positioned in viewBox units, honouring `xMidYMid meet`,
   * so it stays under the pointer at every width without the aspect ratio being
   * hard-coded here. The tooltip is positioned in stage pixels instead, because
   * it is page furniture rather than part of the drawing.
   */
  private paintCursor(clientX: number, clientY: number): void {
    const stage = this.stage().nativeElement;
    const svg = stage.querySelector<SVGSVGElement>('.tf-kd-svg');
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    if (!box.width || !box.height) return;

    const view = svg.viewBox.baseVal;
    const scale = Math.min(box.width / view.width, box.height / view.height) || 1;
    stage.style.setProperty(
      '--kd-x', `${(clientX - box.left - (box.width - view.width * scale) / 2) / scale}px`);
    stage.style.setProperty(
      '--kd-y', `${(clientY - box.top - (box.height - view.height * scale) / 2) / scale}px`);

    const stageBox = stage.getBoundingClientRect();
    stage.style.setProperty('--kd-tx', `${clientX - stageBox.left}px`);
    stage.style.setProperty('--kd-ty', `${clientY - stageBox.top}px`);
  }
}
