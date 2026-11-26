import type { Metadata } from "next";
import { ViewTransition } from "react";
import "@fontsource-variable/geist";
import "@fontsource-variable/manrope";
import "@/app/globals.css";
import "@/app/header.css";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: { default: "SeatSync — Find your space. Book your seat.", template: "%s | SeatSync" },
  description: "Explore coworking spaces, libraries and study centres in Mangaluru, Bengaluru and Hubballi.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <SiteHeader />
        <ViewTransition name="seatsync-page"><main id="main-content">{children}</main></ViewTransition>
        <SiteFooter />
      </body>
    </html>
  );
}
