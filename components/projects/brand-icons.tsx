import type { ComponentType } from "react";
import {
  IconBrandFacebook,
  IconBrandGoogle,
  IconBrandGoogleAnalytics,
  IconBrandInstagram,
  IconBrandMeta,
  IconToolsKitchen2,
  type IconProps,
} from "@tabler/icons-react";

export type BrandIconName =
  | "meta"
  | "instagram"
  | "facebook"
  | "google-ads"
  | "google-analytics"
  | "ifood"
  | "digital-menu"
  | "google";

const TABLER_BRANDS: Partial<Record<BrandIconName, ComponentType<IconProps>>> = {
  meta: IconBrandMeta,
  instagram: IconBrandInstagram,
  facebook: IconBrandFacebook,
  "google-analytics": IconBrandGoogleAnalytics,
  google: IconBrandGoogle,
  "digital-menu": IconToolsKitchen2,
};

// Vendored from Simple Icons 14.15.0 only when Tabler has no faithful mark.
const BRAND_PATHS: Partial<Record<BrandIconName, string>> = {
  "google-ads": "M4 22.929a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm19.464-6L15.463 3.072A4 4 0 0 0 8.534 7.072l8.001 13.856a4 4 0 1 0 6.929-4zM7.514 4.844 1.565 15.148A4.5 4.5 0 0 1 4 14.43c2.56-.008 4.625 2.158 4.494 4.714l3.217-5.572-3.61-6.25a3.978 3.978 0 0 1-.587-2.478z",
};

export function BrandIcon({
  name,
  ...props
}: IconProps & { name: BrandIconName }) {
  const TablerBrand = TABLER_BRANDS[name];
  if (TablerBrand) return <TablerBrand stroke={1.8} aria-hidden="true" focusable="false" {...props} />;
  const { size = 24, stroke, ...svgProps } = props;
  void stroke;

  if (name === "ifood") {
    return (
      // A marca oficial fica versionada localmente e não depende de recurso externo.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/brands/ifood.svg"
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        className={props.className}
        style={props.style}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...svgProps}
    >
      <path d={BRAND_PATHS[name] ?? ""} />
    </svg>
  );
}
