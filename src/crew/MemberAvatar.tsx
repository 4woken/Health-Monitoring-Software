import type { PersonalAvatar } from '../camera/face/portrait'
import { initialsOf, type Member } from './roster'

/** A round picture of the person: their captured face when there is one, otherwise their initials. */
export default function MemberAvatar({
  member,
  face,
  size = 40,
}: {
  member: Member
  face: PersonalAvatar | null
  size?: number
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.1] font-cond font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {face ? (
        <img
          src={face.imageUrl}
          alt=""
          className="h-full w-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
      ) : (
        initialsOf(member.name)
      )}
    </span>
  )
}
