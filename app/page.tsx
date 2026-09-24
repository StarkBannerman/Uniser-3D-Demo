import { redirect } from "next/navigation";

/**
 * Home goes straight to the bedroom.
 *
 * While the bedroom is the only room being shown, a picker with one card on it
 * is a click between the client and the demo. The space list, the segment
 * columns and the roadmap that used to live here are in git history — restore
 * this file and clear the `unlisted` flags on the other spaces to bring them
 * back.
 */
export default function Home() {
  redirect("/demo/master-bedroom");
}
