import { redirect } from 'next/navigation';

/** The About page is merchant-editable content; /about is a friendly alias. */
export default function AboutRedirect() {
  redirect('/pages/about');
}
