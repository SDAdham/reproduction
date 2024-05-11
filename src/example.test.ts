import { Collection, Entity, ManyToOne, MikroORM, OneToMany, PrimaryKey, Property } from '@mikro-orm/sqlite';

@Entity()
class User {

  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;

  @OneToMany(() => Group, v => v.user)
  groups = new Collection<Group>(this);
}

@Entity()
class Group {
  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;

  @ManyToOne(() => User)
  user!: User;

  @OneToMany(() => Permission, v => v.group)
  permissions = new Collection<Permission>(this);
}

@Entity()
class Permission {
  @PrimaryKey()
  id!: number;

  @Property()
  write!: boolean;

  @ManyToOne(() => Group)
  group!: Group;
}

let orm: MikroORM;

beforeAll(async () => {
  orm = await MikroORM.init({
    dbName: ':memory:',
    entities: [User, Group, Permission],
    debug: ['query', 'query-params'],
    allowGlobalContext: true, // only for testing
  });
  await orm.schema.refreshDatabase();
});

afterAll(async () => {
  await orm.close(true);
});

const buildEnv = async() => {
  orm.em.create(User, { name: 'Foo' });
  await orm.em.flush();
  orm.em.clear();

  const user = await orm.em.findOneOrFail(User, { name: 'Foo' });

  orm.em.create(Group, { name: 'Test group', user })
  await orm.em.flush();
  orm.em.clear();

  const group = await orm.em.findOneOrFail(Group, { name: 'Test group' });

  orm.em.create(Permission, { write: true, group })
  await orm.em.flush();
  orm.em.clear();
}

test('expected behaviour', async () => {
  await buildEnv();
  const users = await orm.em.find(User, { name: 'Foo' })

  if (!users[0].groups.isInitialized()) {
    await users[0].groups.matching({
      store: true,
      orderBy: {
        permissions: {
          id: 'ASC'
        }
      },
      where: {
        permissions: {
          write: true
        }
      },
      populate: ['permissions'],
      populateWhere: {
        permissions: {
          write: true
        }
      }
    })
    expect(users[0].groups[0].permissions[0].write).toBe(true);
    expect((users[0].groups[0].permissions as any)._populated).toBe(undefined); // this is the problem / it should be true

    // fixing the problem:
    (users[0].groups[0].permissions as any)._populated = true;
    const fail = (users[0] as any).toJSON();

    expect(fail.groups[0].permissions[0].write).toBe(true); // this won't fail but in the next test it will fail
  }
});

test('reproduce bug', async () => {
  await buildEnv();

  const users = await orm.em.find(User, { name: 'Foo' })

  if (!users[0].groups.isInitialized()) {
    await users[0].groups.matching({
      store: true,
      orderBy: {
        permissions: {
          id: 'ASC'
        }
      },
      where: {
        permissions: {
          write: true
        }
      },
      populate: ['permissions'],
      populateWhere: {
        permissions: {
          write: true
        }
      }
    })
    expect(users[0].groups[0].permissions[0].write).toBe(true);
    expect((users[0].groups[0].permissions as any)._populated).toBe(undefined); // this is the problem / it should be true

    const fail = (users[0] as any).toJSON();

    expect(fail.groups[0].permissions[0].write).toBe(true); // this will fail because it no longer exist
  }
});